import { LoggerService } from '@/shared/services/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { Auth0ManagementService } from '../../auth0-management';
import { UserIdentityRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { signInMethodFromSubject } from '../utils';

@Injectable()
export class AddPasswordService {
    public constructor(
        private readonly auth0Management: Auth0ManagementService,
        private readonly userIdentityRepository: UserIdentityRepository,
        private readonly configService: ConfigService,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Adds a password sign-in method to the signed-in User (ADR 0004, "Adding a password").
     * The backend creates the password login for the User's own confirmed email and writes its Identity at once: it created
     * the login, so it knows the subject. The User then sets the password through an email that Auth0 sends, so the link never
     * passes through this server or the browser. Asking again resends that email, which also covers a send that failed.
     * Every attempt is logged with the User id and the issuer, never the email.
     */
    public async addPassword(currentUser: User): Promise<void> {
        const issuer = this.configService.get<string>('auth0.issuer') ?? '';
        if (!currentUser.emailConfirmed) {
            throw this.refuse(currentUser, issuer, new AuthForbiddenException('email_not_verified'));
        }
        const email = currentUser.email.trim().toLowerCase();

        const identities = await this.userIdentityRepository.findByUserId(currentUser.id);
        if (identities.some((identity) => identity.issuer === issuer && signInMethodFromSubject(identity.subject) === 'password')) {
            await this.auth0Management.sendPasswordSetEmail(email);
            this.logger.info(`Password email resent for user ${currentUser.id} (issuer ${issuer})`);
            return;
        }

        const subject = await this.auth0Management.createPasswordUser(email);
        if (!subject) {
            // A login with this email exists but is not ours to claim here: it was not created for this User, so it is connected with the nonce flow.
            throw this.refuse(currentUser, issuer, new AuthConflictException('password_login_exists'));
        }

        try {
            await this.userIdentityRepository.link(currentUser.id, issuer, subject);
        } catch (error: unknown) {
            // Without the Identity the new login would be an orphan nobody can use, so take it away again. A failure here is only logged.
            await this.auth0Management.deleteIdentities(currentUser.id, [{ issuer, subject }]);
            throw error;
        }

        await this.auth0Management.sendPasswordSetEmail(email);
        this.logger.info(`Password login created for user ${currentUser.id} (issuer ${issuer})`);
    }

    /** Logs a refused attempt (User id and issuer, never the email) and returns the exception to throw. */
    private refuse<E extends AuthConflictException | AuthForbiddenException>(currentUser: User, issuer: string, exception: E): E {
        this.logger.warn(`Add password refused for user ${currentUser.id} (issuer ${issuer}): ${exception.code}`);
        return exception;
    }
}
