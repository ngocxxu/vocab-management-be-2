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
import { AccountLinkService, AuthService } from './services';

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
        findByUserId: async (userId: string) => {
            await settle();
            return identities.filter((entry) => entry.userId === userId).map(({ issuer, subject }) => ({ issuer, subject }));
        },
        link: async (userId: string, issuer: string, subject: string) => {
            await settle();
            if (identities.some((entry) => entry.issuer === issuer && entry.subject === subject)) {
                throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
            }
            identities.push({ userId, issuer, subject });
        },
    };
    return { users, identities, userRepository, identityRepository };
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
                AccountLinkService,
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

    it('gives a linked password user their original User back, without creating a second one', async () => {
        // The state the link script leaves behind: the original User plus an Identity for the new Auth0 login.
        const original = { email: 'pw.user@example.com', firstName: 'Pat', lastName: 'Word', identities: { create: { issuer: ISSUER, subject: 'auth0|pw1' } } };
        const owner = await fakes.userRepository.create(original as Prisma.UserCreateInput);
        const token = as('t-pw', login('auth0|pw1', { email: 'pw.user@example.com' }));

        const synced = await sync(token);
        const seen = await probe(token);

        expect(synced.status).toBe(200);
        expect(synced.body.id).toBe(owner.id);
        expect(seen.body.userId).toBe(owner.id);
        expect(fakes.users).toHaveLength(1);
    });

    it('requires a token on the sync route', async () => {
        const response = await request(app.getHttpServer()).post('/auth/sync');

        expect(response.status).toBe(401);
    });

    describe('account link (HTTP)', () => {
        const now = () => Math.floor(Date.now() / 1000);
        const link = async (sessionToken: string, linkToken: string) =>
            request(app.getHttpServer()).post('/auth/identities/link').set('Authorization', `Bearer ${sessionToken}`).send({ linkToken });
        const methods = async (sessionToken: string) => request(app.getHttpServer()).get('/auth/identities').set('Authorization', `Bearer ${sessionToken}`);

        it('connects a second sign-in method to the signed-in User, who can then sign in with either', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const second = as('t-ada-pw', login('auth0|ada-pw', { email: 'ada.pw@example.com', issuedAt: now() - 10 }));

            const response = await link(session, second);
            const viaSecond = await probe(second);

            expect(response.status).toBe(200);
            expect(response.body.methods).toEqual(['google', 'password']);
            expect(fakes.users).toHaveLength(1);
            expect(viaSecond.body.userId).toBe(fakes.users[0].id);
        });

        it('refuses a sign-in method that belongs to another User with 409 identity_already_linked', async () => {
            const ada = as('t-ada', login('google-oauth2|ada'));
            const bob = as('t-bob', login('google-oauth2|bob'));
            await sync(ada);
            await sync(bob);
            const bobsOtherLogin = as('t-bob-pw', login('auth0|bob-pw', { issuedAt: now() - 10 }));
            await link(bob, bobsOtherLogin);

            const response = await link(ada, bobsOtherLogin);

            expect(response.status).toBe(409);
            expect(response.body.message).toBe('identity_already_linked');
            expect((await methods(ada)).body.methods).toEqual(['google']);
        });

        it('refuses a link token older than five minutes with 403 link_proof_stale', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const stale = as('t-ada-pw', login('auth0|ada-pw', { issuedAt: now() - 301 }));

            const response = await link(session, stale);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('link_proof_stale');
        });

        it('refuses an unverified second login with 403 email_not_verified', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const unverified = as('t-ada-pw', login('auth0|ada-pw', { emailVerified: false, issuedAt: now() - 10 }));

            const response = await link(session, unverified);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('email_not_verified');
        });

        it("lists only the caller's own sign-in methods, as labels", async () => {
            const ada = as('t-ada', login('google-oauth2|ada'));
            const bob = as('t-bob', login('google-oauth2|bob'));
            await sync(ada);
            await sync(bob);
            await link(bob, as('t-bob-pw', login('auth0|bob-pw', { issuedAt: now() - 10 })));

            const response = await methods(ada);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ methods: ['google'] });
            expect(JSON.stringify(response.body)).not.toContain('ada');
        });

        it('requires a signed-in session on both routes', async () => {
            const link401 = await request(app.getHttpServer()).post('/auth/identities/link').send({ linkToken: 'x' });
            const list401 = await request(app.getHttpServer()).get('/auth/identities');

            expect([link401.status, list401.status]).toEqual([401, 401]);
        });

        it('limits the link route to 5 attempts a minute', () => {
            const handler = Object.getOwnPropertyDescriptor(AuthController.prototype, 'linkIdentity')?.value as object;

            expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
            expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
        });
    });
});
