import { RedisService } from '@/shared/services/redis.service';
import { RedisKeyManager } from '@/shared/utils/redis-key.util';
import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LanguageFolderRepository } from '../../language-folder/repositories';
import { SubjectRepository } from '../../subject/repositories';
import { PlanQuotaExceededException } from '../exceptions';
import { PlanRepository } from '../repositories';
import { DEFAULT_QUOTA_LIMITS, TQuotaLimitKey, UNLIMITED_LIMIT, readQuotaLimit } from '../utils';

const VOCAB_QUOTA_TTL_SECONDS = 86400;

export type CreationResource = 'vocab' | 'languageFolder' | 'subject';

const LIMIT_KEY_BY_RESOURCE: Record<CreationResource, TQuotaLimitKey> = {
    vocab: 'vocabPerDay',
    languageFolder: 'languageFolders',
    subject: 'subjects',
};

type TQuotaCheck = (userId: string, limit: number, role: UserRole) => Promise<void>;

@Injectable()
export class PlanQuotaService {
    private readonly logger = new Logger(PlanQuotaService.name);

    // One handler per resource: an unknown resource is a type error, never a silent fall-through to another quota.
    private readonly quotaChecks: Record<CreationResource, TQuotaCheck> = {
        vocab: async (userId, limit, role) => this.assertVocabDailyQuota(userId, limit, role),
        languageFolder: async (userId, limit, role) => this.assertLanguageFolderQuota(userId, limit, role),
        subject: async (userId, limit, role) => this.assertSubjectQuota(userId, limit, role),
    };

    public constructor(
        private readonly languageFolderRepository: LanguageFolderRepository,
        private readonly subjectRepository: SubjectRepository,
        private readonly redisService: RedisService,
        private readonly planRepository: PlanRepository,
    ) {}

    /**
     * Asserts the user is within the creation quota for the given resource.
     * ADMIN is never checked against a plan. A limit of -1 is unlimited.
     * @throws PlanQuotaExceededException when quota exceeded
     */
    public async assertCreationQuota(userId: string, role: UserRole, resource: CreationResource): Promise<void> {
        if (role === UserRole.ADMIN) {
            return;
        }

        const limit = await this.resolveLimit(role, LIMIT_KEY_BY_RESOURCE[resource]);
        if (limit === UNLIMITED_LIMIT) {
            return;
        }

        await this.quotaChecks[resource](userId, limit, role);
    }

    /**
     * Reads the live plan on every call, so a changed limit applies on the next create without a restart.
     * A missing or inactive plan, or a missing or invalid key, falls back to the documented default.
     */
    private async resolveLimit(role: UserRole, key: TQuotaLimitKey): Promise<number> {
        const plan = await this.planRepository.findByRole(role);
        const storedLimits = plan?.isActive ? plan.limits : undefined;
        const storedLimit = readQuotaLimit(storedLimits, key);

        if (storedLimit === undefined && this.hasStoredValue(storedLimits, key)) {
            this.logger.warn(`Ignoring invalid "${key}" in the ${role} plan limits; using the default`);
        }

        return storedLimit ?? DEFAULT_QUOTA_LIMITS[role][key];
    }

    private hasStoredValue(storedLimits: unknown, key: TQuotaLimitKey): boolean {
        return typeof storedLimits === 'object' && storedLimits !== null && (storedLimits as Record<string, unknown>)[key] !== undefined;
    }

    /** Only a GUEST can act on the hint; a capped MEMBER would be told to upgrade to the plan they already have. */
    private limitReached(message: string, role: UserRole): PlanQuotaExceededException {
        return new PlanQuotaExceededException(role === UserRole.GUEST ? `${message} Upgrade to Member for unlimited.` : message);
    }

    private async assertVocabDailyQuota(userId: string, limit: number, role: UserRole): Promise<void> {
        const dateStr = this.getTodayDateString();
        const key = RedisKeyManager.quota.vocabDaily(userId, dateStr);
        const redis = this.redisService.client;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, VOCAB_QUOTA_TTL_SECONDS);
        }
        if (count > limit) {
            await redis.decr(key);
            throw this.limitReached(`Daily vocab limit reached (${limit} per day).`, role);
        }
    }

    private async assertLanguageFolderQuota(userId: string, limit: number, role: UserRole): Promise<void> {
        const count = await this.languageFolderRepository.countByUserId(userId);
        if (count >= limit) {
            throw this.limitReached(`Language folder limit reached (${limit}).`, role);
        }
    }

    private async assertSubjectQuota(userId: string, limit: number, role: UserRole): Promise<void> {
        const count = await this.subjectRepository.countByUserId(userId);
        if (count >= limit) {
            throw this.limitReached(`Subject limit reached (${limit}).`, role);
        }
    }

    private getTodayDateString(): string {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}
