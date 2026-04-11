import { RedisService } from '@/shared/services/redis.service';
import { RedisKeyManager } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LanguageFolderRepository } from '../../language-folder/repositories';
import { SubjectRepository } from '../../subject/repositories';
import { PlanQuotaExceededException } from '../exceptions';

const QUOTA_VOCAB_PER_DAY = 20;
const QUOTA_LANGUAGE_FOLDERS = 2;
const QUOTA_SUBJECTS = 3;
const VOCAB_QUOTA_TTL_SECONDS = 86400;

export type CreationResource = 'vocab' | 'languageFolder' | 'subject';

@Injectable()
export class PlanQuotaService {
    public constructor(
        private readonly languageFolderRepository: LanguageFolderRepository,
        private readonly subjectRepository: SubjectRepository,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Asserts the user is within creation quota for the given resource.
     * ADMIN bypass: no limit. MEMBER: unlimited. GUEST: enforced (vocab 20/day, 2 folders, 3 subjects).
     * @throws PlanQuotaExceededException when quota exceeded
     */
    public async assertCreationQuota(userId: string, role: UserRole, resource: CreationResource): Promise<void> {
        if (role === UserRole.ADMIN) {
            return;
        }
        if (role === UserRole.MEMBER) {
            return;
        }

        if (resource === 'vocab') {
            await this.assertVocabDailyQuota(userId);
            return;
        }
        if (resource === 'languageFolder') {
            await this.assertLanguageFolderQuota(userId);
            return;
        }
        if (resource === 'subject') {
            await this.assertSubjectQuota(userId);
        }
    }

    private async assertVocabDailyQuota(userId: string): Promise<void> {
        const dateStr = this.getTodayDateString();
        const key = RedisKeyManager.quota.vocabDaily(userId, dateStr);
        const redis = this.redisService.client;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, VOCAB_QUOTA_TTL_SECONDS);
        }
        if (count > QUOTA_VOCAB_PER_DAY) {
            await redis.decr(key);
            throw new PlanQuotaExceededException(`Daily vocab limit reached (${QUOTA_VOCAB_PER_DAY} per day). Upgrade to Member for unlimited.`);
        }
    }

    private async assertLanguageFolderQuota(userId: string): Promise<void> {
        const count = await this.languageFolderRepository.countByUserId(userId);
        if (count >= QUOTA_LANGUAGE_FOLDERS) {
            throw new PlanQuotaExceededException(`Language folder limit reached (${QUOTA_LANGUAGE_FOLDERS}). Upgrade to Member for unlimited.`);
        }
    }

    private async assertSubjectQuota(userId: string): Promise<void> {
        const count = await this.subjectRepository.countByUserId(userId);
        if (count >= QUOTA_SUBJECTS) {
            throw new PlanQuotaExceededException(`Subject limit reached (${QUOTA_SUBJECTS}). Upgrade to Member for unlimited.`);
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
