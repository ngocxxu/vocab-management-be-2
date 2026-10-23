import 'reflect-metadata';

import type { Auth0IdToken, AuthUser } from '@/auth';
import { GlobalAuthGuard } from '@/auth/guards/global-auth.guard';
import { AuthIdentityService } from '@/auth/services/auth-identity.service';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { LoggerService } from '@/shared/services/logger.service';
import { RedisService } from '@/shared/services/redis.service';
import { Controller, Get, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common/interfaces/nest-application.interface';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import request from 'supertest';

import { Auth0ManagementService } from '../auth0-management';
import { UserIdentityRepository, UserRepository } from '../user/repositories';
import { AuthController } from './controllers';
import { LinkNonceRepository } from './repositories';
import { AccountLinkService, AddPasswordService, AuthService, ResendVerificationEmailService } from './services';

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
    const nonces: { nonce: string; userId: string; expiresAt: number; used: boolean }[] = [];
    const nonceRepository = {
        create: async (userId: string, nonce: string, expiresAt: Date) => {
            await settle();
            nonces.push({ nonce, userId, expiresAt: expiresAt.getTime(), used: false });
        },
        consume: async (nonce: string, userId: string, now: Date) => {
            await settle();
            const row = nonces.find((entry) => entry.nonce === nonce && entry.userId === userId && !entry.used && entry.expiresAt > now.getTime());
            if (!row) {
                return false;
            }
            row.used = true;
            return true;
        },
    };
    return { users, identities, userRepository, identityRepository, nonceRepository };
}

describe('POST /auth/sync (HTTP)', () => {
    let app: INestApplication;
    let fakes: ReturnType<typeof createFakes>;
    const tokens = new Map<string, AuthUser>();
    const idTokens = new Map<string, Auth0IdToken>();
    const auth0Management = {
        createPasswordUser: jest.fn<Promise<string | null>, [string]>(),
        sendPasswordSetEmail: jest.fn<Promise<void>, [string]>(),
        deleteIdentities: jest.fn<Promise<void>, [string, { issuer: string; subject: string }[]]>(),
        getLastPasswordReset: jest.fn<Promise<string | null>, [string]>(),
        sendVerificationEmail: jest.fn<Promise<void>, [string]>(),
    };

    const as = (token: string, authUser: AuthUser) => {
        tokens.set(token, authUser);
        return token;
    };
    const sync = async (token: string) => request(app.getHttpServer()).post('/auth/sync').set('Authorization', `Bearer ${token}`);
    const probe = async (token: string) => request(app.getHttpServer()).get('/probe').set('Authorization', `Bearer ${token}`);

    beforeEach(async () => {
        fakes = createFakes();
        tokens.clear();
        idTokens.clear();
        auth0Management.createPasswordUser.mockReset().mockResolvedValue('auth0|new123');
        auth0Management.sendPasswordSetEmail.mockReset().mockResolvedValue();
        auth0Management.deleteIdentities.mockReset().mockResolvedValue();
        auth0Management.getLastPasswordReset.mockReset().mockResolvedValue('2026-10-17T09:00:00.000Z');
        const authTokenService = {
            extractBearerToken: (req: { headers: { authorization?: string } }) => req.headers.authorization?.replace('Bearer ', '') ?? null,
            resolveAuthUser: async (token: string) => {
                const authUser = tokens.get(token);
                if (!authUser) {
                    throw new (await import('@nestjs/common')).UnauthorizedException('Invalid or expired token');
                }
                return authUser;
            },
            verifyIdToken: async (token: string) => {
                const idToken = idTokens.get(token);
                if (!idToken) {
                    throw new (await import('@nestjs/common')).UnauthorizedException('id_token_invalid');
                }
                return idToken;
            },
        };
        const moduleRef = await Test.createTestingModule({
            controllers: [AuthController, ProbeController],
            providers: [
                AuthService,
                AccountLinkService,
                AddPasswordService,
                ResendVerificationEmailService,
                AuthIdentityService,
                { provide: Auth0ManagementService, useValue: auth0Management },
                { provide: RedisService, useValue: { setIfAbsent: jest.fn(async () => Promise.resolve(true)), del: jest.fn() } },
                { provide: ConfigService, useValue: { get: (key: string) => (key === 'auth0.issuer' ? ISSUER : undefined) } },
                { provide: APP_GUARD, useClass: GlobalAuthGuard },
                { provide: AuthTokenService, useValue: authTokenService },
                { provide: UserRepository, useValue: fakes.userRepository },
                { provide: UserIdentityRepository, useValue: fakes.identityRepository },
                { provide: LinkNonceRepository, useValue: fakes.nonceRepository },
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

    describe('resend verification (HTTP)', () => {
        const resend = async (token?: string) => {
            const call = request(app.getHttpServer()).post('/auth/resend-verification');
            return token ? call.set('Authorization', `Bearer ${token}`) : call;
        };
        const unverified = (subject: string): AuthUser => ({ id: subject, email: 'ada@example.com', roles: [], provider: 'auth0', issuer: ISSUER, subject, emailVerified: false });

        beforeEach(() => {
            auth0Management.sendVerificationEmail.mockReset().mockResolvedValue();
        });

        it('requires a token', async () => {
            const response = await resend();

            expect(response.status).toBe(401);
            expect(auth0Management.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('emails the login in the token, with no email accepted from the request', async () => {
            const token = as('unverified-token', unverified('auth0|pending'));

            const response = await request(app.getHttpServer()).post('/auth/resend-verification').set('Authorization', `Bearer ${token}`).send({ email: 'victim@example.com' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ emailSent: true });
            expect(auth0Management.sendVerificationEmail).toHaveBeenCalledTimes(1);
            expect(auth0Management.sendVerificationEmail).toHaveBeenCalledWith('auth0|pending');
        });

        it('sends nothing for a login that is already verified', async () => {
            const token = as('verified-token', { ...unverified('auth0|done'), emailVerified: true });

            const response = await resend(token);

            expect(response.status).toBe(200);
            expect(auth0Management.sendVerificationEmail).not.toHaveBeenCalled();
        });
    });

    describe('account link (HTTP)', () => {
        const now = () => Math.floor(Date.now() / 1000);
        const nonceFor = async (sessionToken: string) =>
            (await request(app.getHttpServer()).post('/auth/identities/link-nonce').set('Authorization', `Bearer ${sessionToken}`)).body.nonce as string;
        /** The ID token Auth0 would return for the second login, carrying the nonce that login was started with. */
        const idTokenOf = (name: string, subject: string, nonce: string, overrides: Partial<Auth0IdToken> = {}) => {
            idTokens.set(name, { issuer: ISSUER, subject, nonce, authTime: now() - 10, email: `${subject.replace(/\W/g, '')}@example.com`, emailVerified: true, ...overrides });
            return name;
        };
        const link = async (sessionToken: string, idToken: string) =>
            request(app.getHttpServer()).post('/auth/identities/link').set('Authorization', `Bearer ${sessionToken}`).send({ idToken });
        const methods = async (sessionToken: string) => request(app.getHttpServer()).get('/auth/identities').set('Authorization', `Bearer ${sessionToken}`);

        it('issues a nonce to the signed-in User', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);

            const response = await request(app.getHttpServer()).post('/auth/identities/link-nonce').set('Authorization', `Bearer ${session}`);

            expect(response.status).toBe(201);
            expect(response.body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        });

        it('connects a second sign-in method to the signed-in User, who can then sign in with either', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const idToken = idTokenOf('id-ada-pw', 'auth0|ada-pw', await nonceFor(session));

            const response = await link(session, idToken);
            const viaSecond = await probe(as('t-ada-pw', login('auth0|ada-pw')));

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
            await link(bob, idTokenOf('id-bob-pw', 'auth0|bob-pw', await nonceFor(bob)));

            const response = await link(ada, idTokenOf('id-bob-pw-again', 'auth0|bob-pw', await nonceFor(ada)));

            expect(response.status).toBe(409);
            expect(response.body.message).toBe('identity_already_linked');
            expect((await methods(ada)).body.methods).toEqual(['google']);
        });

        it('refuses a sign-in older than five minutes with 403 link_proof_stale', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const stale = idTokenOf('id-ada-pw', 'auth0|ada-pw', await nonceFor(session), { authTime: now() - 301 });

            const response = await link(session, stale);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('link_proof_stale');
        });

        it('refuses an unverified second login with 403 email_not_verified', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const unverified = idTokenOf('id-ada-pw', 'auth0|ada-pw', await nonceFor(session), { emailVerified: false });

            const response = await link(session, unverified);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('email_not_verified');
        });

        it('refuses a nonce that was already used with 403 link_nonce_invalid', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);
            const nonce = await nonceFor(session);
            await link(session, idTokenOf('id-ada-pw', 'auth0|ada-pw', nonce));

            const response = await link(session, idTokenOf('id-ada-pw-2', 'auth0|ada-pw-2', nonce));

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('link_nonce_invalid');
            expect((await methods(session)).body.methods).toEqual(['google', 'password']);
        });

        it("refuses another User's nonce with 403 link_nonce_invalid", async () => {
            const ada = as('t-ada', login('google-oauth2|ada'));
            const bob = as('t-bob', login('google-oauth2|bob'));
            await sync(ada);
            await sync(bob);
            const bobsNonce = await nonceFor(bob);

            const response = await link(ada, idTokenOf('id-mallory', 'auth0|mallory', bobsNonce));

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('link_nonce_invalid');
            expect((await methods(ada)).body.methods).toEqual(['google']);
        });

        it('refuses an ID token that does not verify with 401 id_token_invalid', async () => {
            const session = as('t-ada', login('google-oauth2|ada'));
            await sync(session);

            const response = await link(session, 'not-an-id-token');

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('id_token_invalid');
        });

        it("lists only the caller's own sign-in methods, as labels", async () => {
            const ada = as('t-ada', login('google-oauth2|ada'));
            const bob = as('t-bob', login('google-oauth2|bob'));
            await sync(ada);
            await sync(bob);
            await link(bob, idTokenOf('id-bob-pw', 'auth0|bob-pw', await nonceFor(bob)));

            const response = await methods(ada);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ methods: ['google'], pending: [] });
            expect(JSON.stringify(response.body)).not.toContain('ada');
        });

        it('requires a signed-in session on every route', async () => {
            const nonce401 = await request(app.getHttpServer()).post('/auth/identities/link-nonce');
            const link401 = await request(app.getHttpServer()).post('/auth/identities/link').send({ idToken: 'x' });
            const list401 = await request(app.getHttpServer()).get('/auth/identities');

            expect([nonce401.status, link401.status, list401.status]).toEqual([401, 401, 401]);
        });

        describe('adding a password', () => {
            const addPassword = async (sessionToken: string) => request(app.getHttpServer()).post('/auth/identities/password').set('Authorization', `Bearer ${sessionToken}`);

            it('creates the password login, connects it to the same User, and has the email sent', async () => {
                const session = as('t-ada', login('google-oauth2|ada', { email: 'ada@example.com' }));
                await sync(session);

                const response = await addPassword(session);
                const viaPassword = await probe(as('t-ada-pw', login('auth0|new123')));

                expect(response.status).toBe(200);
                expect(response.body).toEqual({ emailSent: true });
                expect(auth0Management.createPasswordUser).toHaveBeenCalledWith('ada@example.com');
                expect(viaPassword.body.userId).toBe(fakes.users[0].id);
                auth0Management.getLastPasswordReset.mockResolvedValue(null);
                expect((await methods(session)).body).toEqual({ methods: ['google'], pending: ['password'] });
            });

            it('shows the password as connected once it has been set', async () => {
                const session = as('t-ada', login('google-oauth2|ada', { email: 'ada@example.com' }));
                await sync(session);
                await addPassword(session);
                auth0Management.getLastPasswordReset.mockResolvedValue('2026-10-17T09:00:00.000Z');

                expect((await methods(session)).body).toEqual({ methods: ['google', 'password'], pending: [] });
            });

            it('resends the email on a second request instead of creating another login', async () => {
                const session = as('t-ada', login('google-oauth2|ada'));
                await sync(session);

                await addPassword(session);
                const again = await addPassword(session);

                expect(again.status).toBe(200);
                expect(auth0Management.createPasswordUser).toHaveBeenCalledTimes(1);
                expect(auth0Management.sendPasswordSetEmail).toHaveBeenCalledTimes(2);
            });

            it('answers 409 password_login_exists when a login with that email already exists, and changes nothing', async () => {
                const session = as('t-ada', login('google-oauth2|ada'));
                await sync(session);
                auth0Management.createPasswordUser.mockResolvedValue(null);

                const response = await addPassword(session);

                expect(response.status).toBe(409);
                expect(response.body.message).toBe('password_login_exists');
                expect((await methods(session)).body.methods).toEqual(['google']);
            });

            it('requires a signed-in session', async () => {
                const response = await request(app.getHttpServer()).post('/auth/identities/password');

                expect(response.status).toBe(401);
            });
        });

        it.each([
            ['issueLinkNonce', 10],
            ['linkIdentity', 5],
            ['addPassword', 3],
        ])('limits %s to %i attempts a minute', (method, limit) => {
            const handler = Object.getOwnPropertyDescriptor(AuthController.prototype, method)?.value as object;

            expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(limit);
            expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
        });
    });
});
