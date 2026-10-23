import type { AuthUser } from '@/auth/interfaces/auth-user.interface';
import { LoggerService } from '@/shared/services/logger.service';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Auth0ManagementService } from '../../auth0-management';
import { signInMethodFromSubject } from '../utils';

/** One verification email per login per this many seconds, which caps what one inbox receives at one a minute. */
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class ResendVerificationEmailService {
    public constructor(
        private readonly auth0Management: Auth0ManagementService,
        private readonly redisService: RedisService,
        private readonly configService: ConfigService,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Asks Auth0 to email a new verification link for the login behind this token. The login comes from the token, never from
     * the request, and Auth0 sends the email to the address stored on that login, so the caller cannot pick where it goes.
     * Does nothing for a login that is not one of this tenant's password logins, or whose email is already verified.
     */
    public async resend(authUser: AuthUser): Promise<void> {
        const { subject, issuer } = authUser;
        if (!subject || issuer !== this.configService.get<string>('auth0.issuer') || signInMethodFromSubject(subject) !== 'password' || authUser.emailVerified) {
            return;
        }

        // Hashed so the key holds no subject. Released again on failure, so a failed send can be retried at once.
        const cooldownKey = createHash('sha256').update(subject).digest('hex');
        const claimed = await this.redisService.setIfAbsent(RedisPrefix.VERIFICATION_RESEND, cooldownKey, '1', RESEND_COOLDOWN_SECONDS);
        if (!claimed) {
            this.logger.info('Verification email skipped: one was requested for this login within the cooldown');
            return;
        }

        try {
            await this.auth0Management.sendVerificationEmail(subject);
        } catch (error: unknown) {
            await this.redisService.del(RedisPrefix.VERIFICATION_RESEND, cooldownKey);
            throw error;
        }
        this.logger.info(`Verification email requested for a password login (issuer ${issuer})`);
    }
}
