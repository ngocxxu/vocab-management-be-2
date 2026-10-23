import type { AuthUser } from '@/auth/interfaces/auth-user.interface';
import { LoggerService } from '@/shared/services/logger.service';
import { RedisService } from '@/shared/services/redis.service';
import { ConfigService } from '@nestjs/config';
import { Auth0ManagementService } from '../../auth0-management';
import { ResendVerificationEmailService } from './resend-verification-email.service';

const ISSUER = 'https://tenant.example/';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
    return { id: 'auth0|a', email: null, roles: [], provider: 'auth0', issuer: ISSUER, subject: 'auth0|a', emailVerified: false, ...overrides };
}

function createFakes(options: { claimed?: boolean; auth0Error?: Error } = {}) {
    const auth0Management = {
        sendVerificationEmail: jest.fn(async () => (options.auth0Error ? Promise.reject(options.auth0Error) : Promise.resolve())),
    };
    const redisService = {
        setIfAbsent: jest.fn(async () => Promise.resolve(options.claimed ?? true)),
        del: jest.fn(async () => Promise.resolve(1)),
    };
    const logger = { info: jest.fn(), warn: jest.fn() };
    const configService = { get: (key: string) => (key === 'auth0.issuer' ? ISSUER : undefined) };
    const service = new ResendVerificationEmailService(
        auth0Management as unknown as Auth0ManagementService,
        redisService as unknown as RedisService,
        configService as unknown as ConfigService,
        logger as unknown as LoggerService,
    );
    return { service, auth0Management, redisService, logger };
}

describe('ResendVerificationEmailService.resend', () => {
    it('asks Auth0 to email the login in the token, never an address from the caller', async () => {
        const { service, auth0Management } = createFakes();

        await service.resend(authUser({ subject: 'auth0|abc' }));

        expect(auth0Management.sendVerificationEmail).toHaveBeenCalledTimes(1);
        expect(auth0Management.sendVerificationEmail).toHaveBeenCalledWith('auth0|abc');
    });

    it.each([
        ['an already verified login', { emailVerified: true }],
        ['a social login', { subject: 'google-oauth2|1' }],
        ['a login from another issuer', { issuer: 'https://other.example/' }],
        ['a token without a subject', { subject: undefined }],
    ])('does nothing for %s', async (_label, overrides) => {
        const { service, auth0Management, redisService } = createFakes();

        await service.resend(authUser(overrides));

        expect(auth0Management.sendVerificationEmail).not.toHaveBeenCalled();
        expect(redisService.setIfAbsent).not.toHaveBeenCalled();
    });

    it('skips the send while the login is in its cooldown', async () => {
        const { service, auth0Management } = createFakes({ claimed: false });

        await service.resend(authUser());

        expect(auth0Management.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('keeps the cooldown key free of the subject, and claims it for 60 seconds', async () => {
        const { service, redisService } = createFakes();

        await service.resend(authUser({ subject: 'auth0|abc' }));

        const [, key, value, ttl] = redisService.setIfAbsent.mock.calls[0] as unknown as [string, string, string, number];
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(key).not.toContain('abc');
        expect(value).toBe('1');
        expect(ttl).toBe(60);
    });

    it('releases the cooldown and rethrows when Auth0 fails, so a retry can go through at once', async () => {
        const failure = new Error('Auth0 Management API responded 500');
        const { service, redisService } = createFakes({ auth0Error: failure });

        await expect(service.resend(authUser())).rejects.toBe(failure);

        const [, key] = redisService.setIfAbsent.mock.calls[0] as unknown as [string, string];
        expect(redisService.del).toHaveBeenCalledWith(expect.any(String), key);
    });

    it('logs no subject and no address', async () => {
        const { service, logger } = createFakes();

        await service.resend(authUser({ subject: 'auth0|secret123', email: 'ada@example.com' }));

        const lines = logger.info.mock.calls.map(([line]) => String(line));
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((line) => line.includes('secret123') || line.toLowerCase().includes('ada'))).toBe(false);
    });
});
