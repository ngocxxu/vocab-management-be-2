import { LoggerService } from '@/shared/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { Auth0ManagementService } from '../../auth0-management';
import { UserIdentityRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { AddPasswordService } from './add-password.service';

const ISSUER = 'https://vocab-development.jp.auth0.com/';
const EMAIL = 'Ada@Example.com';

const user = (overrides: Partial<User> = {}): User => ({ id: 'user-a', email: EMAIL, emailConfirmed: true, role: 'MEMBER', ...overrides }) as unknown as User;

function createFakes(options: { createdUserId?: string | null; identities?: { issuer: string; subject: string }[]; linkError?: Error; emailError?: Error } = {}) {
    const identities = options.identities ?? [{ issuer: ISSUER, subject: 'google-oauth2|1' }];
    const auth0Management = {
        createPasswordUser: jest.fn(async () => Promise.resolve(options.createdUserId === undefined ? 'auth0|new123' : options.createdUserId)),
        sendPasswordSetEmail: jest.fn(async () => (options.emailError ? Promise.reject(options.emailError) : Promise.resolve())),
        deleteIdentities: jest.fn(async () => Promise.resolve()),
    };
    const identityRepository = {
        findByUserId: jest.fn(async () => Promise.resolve(identities)),
        link: jest.fn(async () => (options.linkError ? Promise.reject(options.linkError) : Promise.resolve())),
    };
    const logger = { info: jest.fn(), warn: jest.fn() };
    const config = { get: (key: string) => (key === 'auth0.issuer' ? ISSUER : undefined) } as unknown as ConfigService;
    const service = new AddPasswordService(
        auth0Management as unknown as Auth0ManagementService,
        identityRepository as unknown as UserIdentityRepository,
        config,
        logger as unknown as LoggerService,
    );
    return { service, auth0Management, identityRepository, logger };
}

describe('AddPasswordService.addPassword', () => {
    it("creates the login for the User's own email, writes its Identity, and has Auth0 send the email", async () => {
        const { service, auth0Management, identityRepository } = createFakes();

        await service.addPassword(user());

        expect(auth0Management.createPasswordUser).toHaveBeenCalledWith('ada@example.com');
        expect(identityRepository.link).toHaveBeenCalledWith('user-a', ISSUER, 'auth0|new123');
        expect(auth0Management.sendPasswordSetEmail).toHaveBeenCalledWith('ada@example.com');
    });

    it('writes the Identity before the email goes out', async () => {
        const { service, auth0Management, identityRepository } = createFakes();

        await service.addPassword(user());

        expect(identityRepository.link.mock.invocationCallOrder[0]).toBeLessThan(auth0Management.sendPasswordSetEmail.mock.invocationCallOrder[0]);
    });

    it('refuses a User whose email is not confirmed, and calls nothing', async () => {
        const { service, auth0Management } = createFakes();

        const attempt = service.addPassword(user({ emailConfirmed: false }));

        await expect(attempt).rejects.toMatchObject({ code: 'email_not_verified' });
        await expect(attempt).rejects.toBeInstanceOf(AuthForbiddenException);
        expect(auth0Management.createPasswordUser).not.toHaveBeenCalled();
    });

    it('does not link a login that already exists, and sends the User to the link flow', async () => {
        const { service, identityRepository, auth0Management } = createFakes({ createdUserId: null });

        const attempt = service.addPassword(user());

        await expect(attempt).rejects.toMatchObject({ code: 'password_login_exists' });
        await expect(attempt).rejects.toBeInstanceOf(AuthConflictException);
        expect(identityRepository.link).not.toHaveBeenCalled();
        expect(auth0Management.sendPasswordSetEmail).not.toHaveBeenCalled();
    });

    it('resends the email instead of creating a second login when the User already has a password', async () => {
        const { service, auth0Management, identityRepository } = createFakes({ identities: [{ issuer: ISSUER, subject: 'auth0|existing' }] });

        await service.addPassword(user());

        expect(auth0Management.createPasswordUser).not.toHaveBeenCalled();
        expect(identityRepository.link).not.toHaveBeenCalled();
        expect(auth0Management.sendPasswordSetEmail).toHaveBeenCalledWith('ada@example.com');
    });

    it('ignores a password Identity from another tenant', async () => {
        const { service, auth0Management } = createFakes({ identities: [{ issuer: 'https://other.auth0.com/', subject: 'auth0|other' }] });

        await service.addPassword(user());

        expect(auth0Management.createPasswordUser).toHaveBeenCalled();
    });

    it('takes the new login away again when the Identity cannot be written, and rethrows', async () => {
        const failure = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
        const { service, auth0Management } = createFakes({ linkError: failure });

        await expect(service.addPassword(user())).rejects.toBe(failure);

        expect(auth0Management.deleteIdentities).toHaveBeenCalledWith('user-a', [{ issuer: ISSUER, subject: 'auth0|new123' }]);
        expect(auth0Management.sendPasswordSetEmail).not.toHaveBeenCalled();
    });

    it('keeps the Identity when only the email fails, so asking again resends it', async () => {
        const failure = new Error('Auth0 password-change request responded 500');
        const { service, auth0Management } = createFakes({ emailError: failure });

        await expect(service.addPassword(user())).rejects.toBe(failure);

        expect(auth0Management.deleteIdentities).not.toHaveBeenCalled();
    });

    it('logs every attempt with the User id and the issuer, never the email', async () => {
        const created = createFakes();
        await created.service.addPassword(user());
        const refused = createFakes({ createdUserId: null });
        await refused.service.addPassword(user()).catch(() => undefined);
        const resent = createFakes({ identities: [{ issuer: ISSUER, subject: 'auth0|existing' }] });
        await resent.service.addPassword(user());

        const lines: string[] = [];
        for (const { logger } of [created, refused, resent]) {
            for (const [line] of [...logger.info.mock.calls, ...logger.warn.mock.calls] as unknown[][]) {
                lines.push(String(line));
            }
        }
        expect(lines).toHaveLength(3);
        expect(lines.every((line) => line.includes('user-a') && line.includes(ISSUER))).toBe(true);
        expect(lines.some((line) => line.toLowerCase().includes('ada@example.com'))).toBe(false);
    });
});
