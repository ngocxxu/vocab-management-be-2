import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisKeyManager } from '../../common/util/redis-key.util';

const QUOTA_VOCAB_PER_DAY = 20;
const QUOTA_LANGUAGE_FOLDERS = 2;
const QUOTA_SUBJECTS = 3;
const VOCAB_QUOTA_TTL_SECONDS = 86400;

export type CreationResource = 'vocab' | 'languageFolder' | 'subject';

@Injectable()
export class PlanQuotaService {
    public constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Asserts the user is within creation quota for the given resource.
     * ADMIN bypass: no limit. MEMBER: unlimited. GUEST: enforced (vocab 20/day, 2 folders, 3 subjects).
     * @throws ForbiddenException when quota exceeded
     */
    public async assertCreationQuota(
        userId: string,
        role: UserRole,
        resource: CreationResource,
    ): Promise<void> {
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
            throw new ForbiddenException(
                `Daily vocab limit reached (${QUOTA_VOCAB_PER_DAY} per day). Upgrade to Member for unlimited.`,
            );
        }
    }

    private async assertLanguageFolderQuota(userId: string): Promise<void> {
        const count = await this.prisma.languageFolder.count({ where: { userId } });
        if (count >= QUOTA_LANGUAGE_FOLDERS) {
            throw new ForbiddenException(
                `Language folder limit reached (${QUOTA_LANGUAGE_FOLDERS}). Upgrade to Member for unlimited.`,
            );
        }
    }

    private async assertSubjectQuota(userId: string): Promise<void> {
        const count = await this.prisma.subject.count({ where: { userId } });
        if (count >= QUOTA_SUBJECTS) {
            throw new ForbiddenException(
                `Subject limit reached (${QUOTA_SUBJECTS}). Upgrade to Member for unlimited.`,
            );
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
