import type { Auth0IdToken } from '@/auth';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { LoggerService } from '@/shared/services/logger.service';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { Auth0ManagementService } from '../../auth0-management';
import { UserIdentityRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { LinkNonceRepository } from '../repositories';
import { AccountLinkService } from './account-link.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const ISSUER = 'https://vocab-development.jp.auth0.com/';
const NOW_MS = Date.parse('2026-10-17T10:00:00Z');
const NOW_S = Math.floor(NOW_MS / 1000);
const SECOND_LOGIN_EMAIL = 'second@example.com';

interface NonceRow {
    nonce: string;
    userId: string;
    expiresAt: number;
    used: boolean;
}

const user = (id: string, email: string): User => ({ id, email, role: 'MEMBER' }) as unknown as User;

const proof = (overrides: Partial<Auth0IdToken> = {}): Auth0IdToken => ({
    issuer: ISSUER,
    subject: 'auth0|second',
    nonce: 'nonce-a',
    authTime: NOW_S - 30,
    email: SECOND_LOGIN_EMAIL,
    emailVerified: true,
    ...overrides,
});

const nonceRow = (overrides: Partial<NonceRow> = {}): NonceRow => ({ nonce: 'nonce-a', userId: 'user-a', expiresAt: NOW_MS + 300_000, used: false, ...overrides });

/** In-memory stand-ins with the same unique constraint on (issuer, subject) and the same single-use nonce rule as the database. */
function createFakes(
    options: {
        tokens?: Record<string, Auth0IdToken | Error>;
        nonces?: NonceRow[];
        raceWinnerUserId?: string;
        passwordSetAt?: Record<string, string | null>;
    } = {},
) {
    const users: User[] = [user('user-a', 'a@example.com'), user('user-b', 'b@example.com')];
    const identities: { userId: string; issuer: string; subject: string }[] = [{ userId: 'user-a', issuer: ISSUER, subject: 'google-oauth2|first' }];
    const tokens = options.tokens ?? { 'token-b': proof() };
    const nonces = options.nonces ?? [nonceRow()];

    const identityRepository = {
        findUserByIdentity: jest.fn(async (issuer: string, subject: string) => {
            await Promise.resolve();
            const identity = identities.find((entry) => entry.issuer === issuer && entry.subject === subject);
            return users.find((entry) => entry.id === identity?.userId) ?? null;
        }),
        findByUserId: jest.fn(async (userId: string) => {
            await Promise.resolve();
            return identities.filter((entry) => entry.userId === userId).map(({ issuer, subject }) => ({ issuer, subject }));
        }),
        link: jest.fn(async (userId: string, issuer: string, subject: string) => {
            await Promise.resolve();
            if (options.raceWinnerUserId && !identities.some((entry) => entry.subject === subject)) {
                identities.push({ userId: options.raceWinnerUserId, issuer, subject });
            }
            if (identities.some((entry) => entry.issuer === issuer && entry.subject === subject)) {
                throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
            }
            identities.push({ userId, issuer, subject });
        }),
    };
    const nonceRepository = {
        create: jest.fn(async (userId: string, nonce: string, expiresAt: Date) => {
            await Promise.resolve();
            nonces.push({ nonce, userId, expiresAt: expiresAt.getTime(), used: false });
        }),
        consume: jest.fn(async (nonce: string, userId: string, now: Date) => {
            await Promise.resolve();
            const row = nonces.find((entry) => entry.nonce === nonce && entry.userId === userId && !entry.used && entry.expiresAt > now.getTime());
            if (!row) {
                return false;
            }
            row.used = true;
            return true;
        }),
    };
    const authTokenService = {
        verifyIdToken: jest.fn(async (token: string) => {
            await Promise.resolve();
            const resolved = tokens[token];
            if (!resolved) {
                throw new UnauthorizedException('id_token_invalid');
            }
            if (resolved instanceof Error) {
                throw resolved;
            }
            return resolved;
        }),
    };
    const logger = { info: jest.fn(), warn: jest.fn() };
    const passwordSetAt = options.passwordSetAt ?? { 'auth0|second': '2026-10-17T09:00:00Z' };
    const auth0Management = {
        getLastPasswordReset: jest.fn(async (subject: string) => Promise.resolve(passwordSetAt[subject] ?? null)),
    };
    const service = new AccountLinkService(
        authTokenService as unknown as AuthTokenService,
        identityRepository as unknown as UserIdentityRepository,
        nonceRepository as unknown as LinkNonceRepository,
        logger as unknown as LoggerService,
        auth0Management as unknown as Auth0ManagementService,
    );
    return { service, identities, nonces, identityRepository, nonceRepository, authTokenService, logger, auth0Management, userA: users[0] };
}

describe('AccountLinkService.issueNonce', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stores an unused nonce bound to the signed-in User that expires in 5 minutes', async () => {
        const { service, nonces, userA } = createFakes({ nonces: [] });

        const nonce = await service.issueNonce(userA);

        expect(nonces).toEqual([{ nonce, userId: 'user-a', expiresAt: NOW_MS + 300_000, used: false }]);
    });

    it('returns an unguessable, URL-safe value that differs on every call', async () => {
        const { service, userA } = createFakes({ nonces: [] });

        const first = await service.issueNonce(userA);
        const second = await service.issueNonce(userA);

        expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(second).not.toBe(first);
    });
});

describe('AccountLinkService.linkAuth0Identity', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
        jest.mocked(captureSentryException).mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('attaches a verified, fresh second login to the signed-in User', async () => {
        const { service, identities, userA } = createFakes();

        await service.linkAuth0Identity(userA, 'token-b');

        expect(identities).toContainEqual({ userId: 'user-a', issuer: ISSUER, subject: 'auth0|second' });
    });

    it('verifies the second login as an Auth0 ID token', async () => {
        const { service, authTokenService, userA } = createFakes();

        await service.linkAuth0Identity(userA, 'token-b');

        expect(authTokenService.verifyIdToken).toHaveBeenCalledWith('token-b');
    });

    it('does not use the email to pick the User: a different email still links to the signed-in User', async () => {
        const { service, identities, userA } = createFakes({ tokens: { 'token-b': proof({ email: 'someone-else@example.com' }) } });

        await service.linkAuth0Identity(userA, 'token-b');

        expect(identities.filter((entry) => entry.userId === 'user-a')).toHaveLength(2);
    });

    it('is idempotent when the same pair is linked again with a new nonce', async () => {
        const { service, identities, identityRepository, userA } = createFakes({
            tokens: { 'token-1': proof({ nonce: 'nonce-a' }), 'token-2': proof({ nonce: 'nonce-b' }) },
            nonces: [nonceRow({ nonce: 'nonce-a' }), nonceRow({ nonce: 'nonce-b' })],
        });
        await service.linkAuth0Identity(userA, 'token-1');

        await service.linkAuth0Identity(userA, 'token-2');

        expect(identityRepository.link).toHaveBeenCalledTimes(1);
        expect(identities.filter((entry) => entry.subject === 'auth0|second')).toHaveLength(1);
    });

    it('refuses with identity_already_linked when the login belongs to another User, and changes nothing', async () => {
        const { service, identities, userA } = createFakes();
        identities.push({ userId: 'user-b', issuer: ISSUER, subject: 'auth0|second' });

        const attempt = service.linkAuth0Identity(userA, 'token-b');

        await expect(attempt).rejects.toMatchObject({ code: 'identity_already_linked' });
        await expect(attempt).rejects.toBeInstanceOf(AuthConflictException);
        expect(identities.filter((entry) => entry.userId === 'user-a')).toHaveLength(1);
        expect(captureSentryException).toHaveBeenCalled();
    });

    it('refuses a login whose email is not verified', async () => {
        const { service, identities, userA } = createFakes({ tokens: { 'token-b': proof({ emailVerified: false }) } });

        const attempt = service.linkAuth0Identity(userA, 'token-b');

        await expect(attempt).rejects.toMatchObject({ code: 'email_not_verified' });
        await expect(attempt).rejects.toBeInstanceOf(AuthForbiddenException);
        expect(identities).toHaveLength(1);
    });

    it.each([
        ['exactly 5 minutes old', NOW_S - 300, true],
        ['one second over 5 minutes old', NOW_S - 301, false],
        ['an hour old', NOW_S - 3600, false],
        ['30 seconds ahead of this server (clock drift)', NOW_S + 30, true],
        ['two minutes ahead of this server', NOW_S + 120, false],
    ])('a sign-in whose auth_time is %s', async (_label, authTime, accepted) => {
        const { service, userA } = createFakes({ tokens: { 'token-b': proof({ authTime }) } });

        const attempt = service.linkAuth0Identity(userA, 'token-b');

        if (accepted) {
            await expect(attempt).resolves.toBeUndefined();
        } else {
            await expect(attempt).rejects.toMatchObject({ code: 'link_proof_stale' });
        }
    });

    it('refuses a proof that carries no auth_time, even though the token is otherwise fresh', async () => {
        const { service, userA } = createFakes({ tokens: { 'token-b': proof({ authTime: undefined }) } });

        await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_proof_stale' });
    });

    it('passes an invalid ID token through as the unauthorized error it is, without touching the nonce', async () => {
        const { service, nonceRepository, userA } = createFakes();

        await expect(service.linkAuth0Identity(userA, 'not-a-token')).rejects.toBeInstanceOf(UnauthorizedException);

        expect(nonceRepository.consume).not.toHaveBeenCalled();
    });

    it('treats losing a race to the same User as success', async () => {
        const { service, userA } = createFakes({ raceWinnerUserId: 'user-a' });

        await expect(service.linkAuth0Identity(userA, 'token-b')).resolves.toBeUndefined();
    });

    it('treats losing a race to another User as identity_already_linked', async () => {
        const { service, userA } = createFakes({ raceWinnerUserId: 'user-b' });

        await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'identity_already_linked' });
    });

    describe('nonce', () => {
        it('refuses a nonce that was already used, and links nothing', async () => {
            const { service, identities, userA } = createFakes({ nonces: [nonceRow({ used: true })] });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_nonce_invalid' });

            expect(identities).toHaveLength(1);
        });

        it('refuses a nonce that expired', async () => {
            const { service, userA } = createFakes({ nonces: [nonceRow({ expiresAt: NOW_MS - 1 })] });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_nonce_invalid' });
        });

        it('refuses a nonce that was issued to another User', async () => {
            const { service, userA } = createFakes({ nonces: [nonceRow({ userId: 'user-b' })] });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_nonce_invalid' });
        });

        it('refuses a nonce the server never issued', async () => {
            const { service, userA } = createFakes({ nonces: [] });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_nonce_invalid' });
        });

        it('refuses an ID token that carries no nonce', async () => {
            const { service, nonceRepository, userA } = createFakes({ tokens: { 'token-b': proof({ nonce: undefined }) } });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_nonce_invalid' });

            expect(nonceRepository.consume).not.toHaveBeenCalled();
        });

        it('spends the nonce even when a later check fails, so it cannot be retried', async () => {
            const { service, nonces, userA } = createFakes({ tokens: { 'token-b': proof({ authTime: NOW_S - 3600 }) } });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_proof_stale' });

            expect(nonces[0].used).toBe(true);
            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_nonce_invalid' });
        });

        it('spends the nonce when the email is not verified, so the user must start again with a new nonce', async () => {
            const { service, nonces, userA } = createFakes({ tokens: { 'token-b': proof({ emailVerified: false }) } });

            await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'email_not_verified' });

            expect(nonces[0].used).toBe(true);
        });
    });

    describe('logging', () => {
        it('logs every attempt without the email', async () => {
            const refused = createFakes();
            refused.identities.push({ userId: 'user-b', issuer: ISSUER, subject: 'auth0|second' });
            await refused.service.linkAuth0Identity(refused.userA, 'token-b').catch(() => undefined);
            const accepted = createFakes();
            await accepted.service.linkAuth0Identity(accepted.userA, 'token-b');

            const calls = [...refused.logger.info.mock.calls, ...refused.logger.warn.mock.calls, ...accepted.logger.info.mock.calls, ...accepted.logger.warn.mock.calls];
            const lines = calls.map(([line]) => String(line));
            expect(lines.length).toBeGreaterThan(0);
            expect(lines.some((line) => line.includes(SECOND_LOGIN_EMAIL) || line.includes('a@example.com'))).toBe(false);
        });

        it('logs the issuer on every accepted attempt, including a repeat of a link already in place', async () => {
            const { service, logger, userA } = createFakes({
                tokens: { 'token-1': proof({ nonce: 'nonce-a' }), 'token-2': proof({ nonce: 'nonce-b' }) },
                nonces: [nonceRow({ nonce: 'nonce-a' }), nonceRow({ nonce: 'nonce-b' })],
            });

            await service.linkAuth0Identity(userA, 'token-1');
            await service.linkAuth0Identity(userA, 'token-2');

            const lines = logger.info.mock.calls.map(([line]) => String(line));
            expect(lines).toHaveLength(2);
            expect(lines.every((line) => line.includes(ISSUER))).toBe(true);
        });

        it('logs the issuer on a refusal', async () => {
            const { service, logger, userA } = createFakes({ tokens: { 'token-b': proof({ emailVerified: false }) } });

            await service.linkAuth0Identity(userA, 'token-b').catch(() => undefined);

            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(ISSUER));
        });

        it('logs a token that does not verify with the issuer marked unverified, then rethrows it', async () => {
            const { service, logger, userA } = createFakes();

            await expect(service.linkAuth0Identity(userA, 'not-a-token')).rejects.toBeInstanceOf(UnauthorizedException);

            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('issuer unverified'));
        });
    });

    describe('Sentry', () => {
        it.each([
            ['a stale proof', { 'token-b': proof({ authTime: NOW_S - 3600 }) }, 'link_proof_stale'],
            ['a nonce that cannot be spent', { 'token-b': proof({ nonce: 'unknown' }) }, 'link_nonce_invalid'],
        ])('reports %s', async (_label, tokens, code) => {
            const { service, userA } = createFakes({ tokens });

            await service.linkAuth0Identity(userA, 'token-b').catch(() => undefined);

            expect(captureSentryException).toHaveBeenCalledWith(expect.objectContaining({ code }), expect.anything());
        });

        it('does not report an unverified email', async () => {
            const { service, userA } = createFakes({ tokens: { 'token-b': proof({ emailVerified: false }) } });

            await service.linkAuth0Identity(userA, 'token-b').catch(() => undefined);

            expect(captureSentryException).not.toHaveBeenCalled();
        });
    });
});

describe('AccountLinkService.listSignInMethods', () => {
    it('returns provider labels only, never the subject or issuer', async () => {
        const { service, identities } = createFakes();
        identities.push({ userId: 'user-a', issuer: ISSUER, subject: 'auth0|second' });

        const methods = await service.listSignInMethods('user-a');

        expect(methods).toEqual({ methods: ['google', 'password'], pending: [] });
    });

    it('lists a password as pending until the User has set it', async () => {
        const { service, identities } = createFakes({ passwordSetAt: { 'auth0|second': null } });
        identities.push({ userId: 'user-a', issuer: ISSUER, subject: 'auth0|second' });

        const methods = await service.listSignInMethods('user-a');

        expect(methods).toEqual({ methods: ['google'], pending: ['password'] });
    });

    it('asks Auth0 only about password Identities', async () => {
        const { service, auth0Management, identities } = createFakes();
        identities.push({ userId: 'user-a', issuer: ISSUER, subject: 'auth0|second' });

        await service.listSignInMethods('user-a');

        expect(auth0Management.getLastPasswordReset).toHaveBeenCalledTimes(1);
        expect(auth0Management.getLastPasswordReset).toHaveBeenCalledWith('auth0|second');
    });
});
