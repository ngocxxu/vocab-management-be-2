import { Auth0ManagementService, TDatabaseLogin } from '@/domains/identity/auth0-management';
import { LoggerService } from '@/shared/services/logger.service';
import { RedisService } from '@/shared/services/redis.service';
import { ResendVerificationEmailService } from './resend-verification-email.service';

function createFakes(options: { logins?: TDatabaseLogin[]; claimed?: boolean; auth0Error?: Error } = {}) {
    const auth0Management = {
        findDatabaseUsersByEmail: jest.fn(async () => Promise.resolve(options.logins ?? [])),
        sendVerificationEmail: jest.fn(async () => (options.auth0Error ? Promise.reject(options.auth0Error) : Promise.resolve())),
    };
    const redisService = {
        setIfAbsent: jest.fn(async () => Promise.resolve(options.claimed ?? true)),
        del: jest.fn(async () => Promise.resolve(1)),
    };
    const logger = { info: jest.fn(), warn: jest.fn() };
    const service = new ResendVerificationEmailService(
        auth0Management as unknown as Auth0ManagementService,
        redisService as unknown as RedisService,
        logger as unknown as LoggerService,
    );
    return { service, auth0Management, redisService, logger };
}

describe('ResendVerificationEmailService.resend', () => {
    it('sends a verification email to each unverified database login, and to no verified one', async () => {
        const { service, auth0Management } = createFakes({
            logins: [
                { subject: 'auth0|a', emailVerified: false },
                { subject: 'auth0|b', emailVerified: true },
            ],
        });

        await service.resend('Ada@Example.com');

        expect(auth0Management.findDatabaseUsersByEmail).toHaveBeenCalledWith('ada@example.com');
        expect(auth0Management.sendVerificationEmail).toHaveBeenCalledTimes(1);
        expect(auth0Management.sendVerificationEmail).toHaveBeenCalledWith('auth0|a');
    });

    it('answers the same and sends nothing when no unverified login exists, so the endpoint reveals nothing', async () => {
        const { service, auth0Management } = createFakes({ logins: [{ subject: 'auth0|b', emailVerified: true }] });

        await expect(service.resend('ada@example.com')).resolves.toBeUndefined();

        expect(auth0Management.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('skips everything while the address is in its cooldown', async () => {
        const { service, auth0Management } = createFakes({ claimed: false, logins: [{ subject: 'auth0|a', emailVerified: false }] });

        await service.resend('ada@example.com');

        expect(auth0Management.findDatabaseUsersByEmail).not.toHaveBeenCalled();
        expect(auth0Management.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('keeps the cooldown key free of the address, and claims it for 60 seconds', async () => {
        const { service, redisService } = createFakes({ logins: [] });

        await service.resend('ada@example.com');

        const [, key, value, ttl] = redisService.setIfAbsent.mock.calls[0] as unknown as [string, string, string, number];
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(key).not.toContain('ada');
        expect(value).toBe('1');
        expect(ttl).toBe(60);
    });

    it('releases the cooldown and swallows the failure, so the answer matches an unknown address and a retry can go through', async () => {
        const failure = new Error('Auth0 Management API responded 500');
        const { service, redisService } = createFakes({ logins: [{ subject: 'auth0|a', emailVerified: false }], auth0Error: failure });

        await expect(service.resend('ada@example.com')).resolves.toBeUndefined();

        const [, key] = redisService.setIfAbsent.mock.calls[0] as unknown as [string, string];
        expect(redisService.del).toHaveBeenCalledWith(expect.any(String), key);
    });

    it('logs counts only, never the address', async () => {
        const { service, logger } = createFakes({ logins: [{ subject: 'auth0|a', emailVerified: false }] });

        await service.resend('ada@example.com');

        const lines = logger.info.mock.calls.map(([line]) => String(line));
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((line) => line.toLowerCase().includes('ada'))).toBe(false);
    });
});
