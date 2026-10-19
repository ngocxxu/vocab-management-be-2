import type { AuthUser } from '@/auth';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { LoggerService } from '@/shared/services/logger.service';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { UserIdentityRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { AccountLinkService } from './account-link.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const ISSUER = 'https://vocab-development.jp.auth0.com/';
const NOW_MS = Date.parse('2026-10-17T10:00:00Z');
const NOW_S = Math.floor(NOW_MS / 1000);
const SECOND_LOGIN_EMAIL = 'second@example.com';

const user = (id: string, email: string): User => ({ id, email, role: 'MEMBER' }) as unknown as User;

const proof = (overrides: Partial<AuthUser> = {}): AuthUser => ({
    id: 'auth0|second',
    email: SECOND_LOGIN_EMAIL,
    emailVerified: true,
    roles: [],
    provider: 'auth0',
    issuer: ISSUER,
    subject: 'auth0|second',
    issuedAt: NOW_S - 30,
    ...overrides,
});

/** In-memory stand-ins with the same unique constraint on (issuer, subject) as the database. */
function createFakes(options: { tokens?: Record<string, AuthUser | Error>; raceWinnerUserId?: string } = {}) {
    const users: User[] = [user('user-a', 'a@example.com'), user('user-b', 'b@example.com')];
    const identities: { userId: string; issuer: string; subject: string }[] = [{ userId: 'user-a', issuer: ISSUER, subject: 'google-oauth2|first' }];
    const tokens = options.tokens ?? { 'token-b': proof() };

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
    const authTokenService = {
        resolveAuthUser: jest.fn(async (token: string) => {
            await Promise.resolve();
            const resolved = tokens[token];
            if (!resolved) {
                throw new UnauthorizedException('Invalid or expired token');
            }
            if (resolved instanceof Error) {
                throw resolved;
            }
            return resolved;
        }),
    };
    const logger = { info: jest.fn(), warn: jest.fn() };
    const service = new AccountLinkService(
        authTokenService as unknown as AuthTokenService,
        identityRepository as unknown as UserIdentityRepository,
        logger as unknown as LoggerService,
    );
    return { service, identities, identityRepository, authTokenService, logger, userA: users[0] };
}

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

    it('verifies the second login as an Auth0 token only, never as a Supabase token', async () => {
        const { service, authTokenService, userA } = createFakes();

        await service.linkAuth0Identity(userA, 'token-b');

        expect(authTokenService.resolveAuthUser).toHaveBeenCalledWith('token-b', 'auth0');
    });

    it('does not use the email to pick the User: a different email still links to the signed-in User', async () => {
        const { service, identities, userA } = createFakes({ tokens: { 'token-b': proof({ email: 'someone-else@example.com' }) } });

        await service.linkAuth0Identity(userA, 'token-b');

        expect(identities.filter((entry) => entry.userId === 'user-a')).toHaveLength(2);
    });

    it('is idempotent when the same pair is linked again', async () => {
        const { service, identities, identityRepository, userA } = createFakes();
        await service.linkAuth0Identity(userA, 'token-b');

        await service.linkAuth0Identity(userA, 'token-b');

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
    ])('a proof that is %s', async (_label, issuedAt, accepted) => {
        const { service, userA } = createFakes({ tokens: { 'token-b': proof({ issuedAt }) } });

        const attempt = service.linkAuth0Identity(userA, 'token-b');

        if (accepted) {
            await expect(attempt).resolves.toBeUndefined();
        } else {
            await expect(attempt).rejects.toMatchObject({ code: 'link_proof_stale' });
        }
    });

    it('refuses a proof that carries no issued-at time', async () => {
        const { service, userA } = createFakes({ tokens: { 'token-b': proof({ issuedAt: undefined }) } });

        await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'link_proof_stale' });
    });

    it('passes an invalid token through as the unauthorized error it is', async () => {
        const { service, userA } = createFakes();

        await expect(service.linkAuth0Identity(userA, 'not-a-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('treats losing a race to the same User as success', async () => {
        const { service, userA } = createFakes({ raceWinnerUserId: 'user-a' });

        await expect(service.linkAuth0Identity(userA, 'token-b')).resolves.toBeUndefined();
    });

    it('treats losing a race to another User as identity_already_linked', async () => {
        const { service, userA } = createFakes({ raceWinnerUserId: 'user-b' });

        await expect(service.linkAuth0Identity(userA, 'token-b')).rejects.toMatchObject({ code: 'identity_already_linked' });
    });

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
        const { service, logger, userA } = createFakes();

        await service.linkAuth0Identity(userA, 'token-b');
        await service.linkAuth0Identity(userA, 'token-b');

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

    it('reports a stale proof to Sentry', async () => {
        const { service, userA } = createFakes({ tokens: { 'token-b': proof({ issuedAt: NOW_S - 3600 }) } });

        await service.linkAuth0Identity(userA, 'token-b').catch(() => undefined);

        expect(captureSentryException).toHaveBeenCalledWith(expect.objectContaining({ code: 'link_proof_stale' }), expect.anything());
    });

    it('does not report an unverified email to Sentry', async () => {
        const { service, userA } = createFakes({ tokens: { 'token-b': proof({ emailVerified: false }) } });

        await service.linkAuth0Identity(userA, 'token-b').catch(() => undefined);

        expect(captureSentryException).not.toHaveBeenCalled();
    });
});

describe('AccountLinkService.listSignInMethods', () => {
    it('returns provider labels only, never the subject or issuer', async () => {
        const { service, identities } = createFakes();
        identities.push({ userId: 'user-a', issuer: ISSUER, subject: 'auth0|second' });

        const methods = await service.listSignInMethods('user-a');

        expect(methods).toEqual(['google', 'password']);
    });
});
