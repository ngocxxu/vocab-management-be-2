import { Auth0ManagementService } from '@/domains/identity/auth0-management';
import { LoggerService } from '@/shared/services/logger.service';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/** One verification email per address per this many seconds, which caps what one address receives at one a minute. */
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class ResendVerificationEmailService {
    public constructor(
        private readonly auth0Management: Auth0ManagementService,
        private readonly redisService: RedisService,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Sends a new verification link to each unverified database login with this email. An unknown, verified or social-only email gets
     * the same answer, and so does a failed send (logged, not thrown), so the status code cannot be used to look up accounts.
     */
    public async resend(email: string): Promise<void> {
        const normalized = email.trim().toLowerCase();
        // Hashed so the key holds no address. Released again on failure, so a failed send can be retried at once.
        const cooldownKey = createHash('sha256').update(normalized).digest('hex');
        const claimed = await this.redisService.setIfAbsent(RedisPrefix.VERIFICATION_RESEND, cooldownKey, '1', RESEND_COOLDOWN_SECONDS);
        if (!claimed) {
            this.logger.info('Verification email skipped: an email was sent for this address within the cooldown');
            return;
        }

        try {
            const pending = (await this.auth0Management.findDatabaseUsersByEmail(normalized)).filter(({ emailVerified }) => !emailVerified);
            for (const { subject } of pending) {
                await this.auth0Management.sendVerificationEmail(subject);
            }
            this.logger.info(`Verification email requested for ${pending.length} unverified login(s)`);
        } catch (error: unknown) {
            await this.redisService.del(RedisPrefix.VERIFICATION_RESEND, cooldownKey);
            // Not rethrown: a 500 only for addresses that have an unverified login would reveal them.
            this.logger.warn(`Verification email could not be requested: ${error instanceof Error ? error.message : 'unknown error'}`);
            captureSentryException(error, { tags: { area: 'resend_verification_email' } });
        }
    }
}
