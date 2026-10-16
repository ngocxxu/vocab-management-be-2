import 'reflect-metadata';

import type { AuthUser } from '@/auth';
import { GlobalAuthGuard } from '@/auth/guards/global-auth.guard';
import { AuthIdentityService } from '@/auth/services/auth-identity.service';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { LoggerService } from '@/shared/services/logger.service';
import { Controller, Get, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common/interfaces/nest-application.interface';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import request from 'supertest';

import { UserIdentityRepository, UserRepository } from '../user/repositories';
import { AuthController } from './controllers';
import { AuthService } from './services';

const ISSUER = 'https://vocab-development.jp.auth0.com/';

/** Stands in for any existing protected route: answers with the internal id the guard resolved. */
@Controller('probe')
class ProbeController {
    @Get()
    public whoAmI(@Req() req: { currentUser?: User; authUser?: AuthUser }): { userId: string | undefined; authId: string | undefined } {
        return { userId: req.currentUser?.id, authId: req.authUser?.id };
    }
}

function login(sub: string, overrides: Partial<AuthUser> = {}): AuthUser {
    return {
        id: sub,
        email: `${sub.replace(/\W/g, '')}@example.com`,
        emailVerified: true,
        roles: [],
        provider: 'auth0',
        issuer: ISSUER,
        subject: sub,
        profile: { firstName: 'Test', lastName: 'User' },
        ...overrides,
    };
}

/** Same unique constraints as the database: user.email and (issuer, subject). */
function createFakes() {
    const users: User[] = [];
    const identities: { userId: string; issuer: string; subject: string }[] = [];
    let nextId = 1;
    const settle = async () => Promise.resolve();

    const userRepository = {
        findByEmailIgnoreCase: async (email: string) => {
            await settle();
            return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
        },
        findBySupabaseUserId: async () => Promise.resolve(null),
        create: async (data: Prisma.UserCreateInput) => {
            await settle();
            if (users.some((existing) => existing.email === data.email)) {
                throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
            }
            const user = { ...data, id: `user-${nextId++}`, isActive: true, role: 'GUEST', createdAt: new Date(), updatedAt: new Date() } as unknown as User;
            users.push(user);
            const { issuer, subject } = (data.identities as { create: { issuer: string; subject: string } }).create;
            identities.push({ userId: user.id, issuer, subject });
            return user;
        },
    };
    const identityRepository = {
        findUserByIdentity: async (issuer: string, subject: string) => {
            await settle();
            const identity = identities.find((entry) => entry.issuer === issuer && entry.subject === subject);
            return users.find((user) => user.id === identity?.userId) ?? null;
        },
    };
    return { users, userRepository, identityRepository };
}

describe('POST /auth/sync (HTTP)', () => {
    let app: INestApplication;
    let fakes: ReturnType<typeof createFakes>;
    const tokens = new Map<string, AuthUser>();

    const as = (token: string, authUser: AuthUser) => {
        tokens.set(token, authUser);
        return token;
    };
    const sync = async (token: string) => request(app.getHttpServer()).post('/auth/sync').set('Authorization', `Bearer ${token}`);
    const probe = async (token: string) => request(app.getHttpServer()).get('/probe').set('Authorization', `Bearer ${token}`);

    beforeEach(async () => {
        fakes = createFakes();
        tokens.clear();
        const authTokenService = {
            extractBearerToken: (req: { headers: { authorization?: string } }) => req.headers.authorization?.replace('Bearer ', '') ?? null,
            resolveAuthUser: async (token: string) => {
                const authUser = tokens.get(token);
                if (!authUser) {
                    throw new (await import('@nestjs/common')).UnauthorizedException('Invalid or expired token');
                }
                return authUser;
            },
        };
        const moduleRef = await Test.createTestingModule({
            controllers: [AuthController, ProbeController],
            providers: [
                AuthService,
                AuthIdentityService,
                { provide: APP_GUARD, useClass: GlobalAuthGuard },
                { provide: AuthTokenService, useValue: authTokenService },
                { provide: UserRepository, useValue: fakes.userRepository },
                { provide: UserIdentityRepository, useValue: fakes.identityRepository },
                { provide: SupabaseAuthProvider, useValue: {} },
                { provide: LoggerService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('creates the User on the first call and returns the same User on repeats', async () => {
        const token = as('t-ada', login('google-oauth2|ada'));

        const first = await sync(token);
        const second = await sync(token);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.id).toBe(first.body.id);
        expect(fakes.users).toHaveLength(1);
    });

    it('creates exactly one User when two first calls arrive together', async () => {
        const token = as('t-ada', login('google-oauth2|ada'));

        const [a, b] = await Promise.all([sync(token), sync(token)]);

        expect([a.status, b.status]).toEqual([200, 200]);
        expect(a.body.id).toBe(b.body.id);
        expect(fakes.users).toHaveLength(1);
    });

    it('refuses an unverified email with 403 email_not_verified and creates nothing', async () => {
        const token = as('t-unverified', login('google-oauth2|unverified', { emailVerified: false }));

        const response = await sync(token);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe('email_not_verified');
        expect(fakes.users).toHaveLength(0);
    });

    it('returns 409 account_link_required when the email belongs to another User and links nothing', async () => {
        const owner = { email: 'taken@example.com', firstName: 'Old', lastName: 'Owner', identities: { create: { issuer: ISSUER, subject: 'google-oauth2|owner' } } };
        await fakes.userRepository.create(owner as Prisma.UserCreateInput);
        const token = as('t-newcomer', login('google-oauth2|newcomer', { email: 'taken@example.com' }));

        const response = await sync(token);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('account_link_required');
        expect(fakes.users).toHaveLength(1);
    });

    it('rejects every other route with 401 identity_not_provisioned until the sync has run', async () => {
        const token = as('t-ada', login('google-oauth2|ada'));

        const before = await probe(token);
        await sync(token);
        const after = await probe(token);

        expect(before.status).toBe(401);
        expect(before.body.message).toBe('identity_not_provisioned');
        expect(after.status).toBe(200);
        expect(after.body.userId).toBe(fakes.users[0].id);
    });

    it('keeps users apart: each token only ever resolves to its own User', async () => {
        const ada = as('t-ada', login('google-oauth2|ada'));
        const bob = as('t-bob', login('google-oauth2|bob'));
        await sync(ada);
        await sync(bob);

        const adaSees = await probe(ada);
        const bobSees = await probe(bob);

        expect(adaSees.body.userId).not.toBe(bobSees.body.userId);
        expect(adaSees.body.authId).toBe(adaSees.body.userId);
        expect(fakes.users).toHaveLength(2);
    });

    it('requires a token on the sync route', async () => {
        const response = await request(app.getHttpServer()).post('/auth/sync');

        expect(response.status).toBe(401);
    });
});
