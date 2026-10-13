import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { Language, Prisma } from '@prisma/client';
import { TLanguageUsage, TLanguageUsagePair } from '../utils';

/** Outcome of `deleteIfUnused`. `missing` means the language was gone before the delete could run. */
export type TLanguageDeleteResult = { status: 'deleted'; language: Language } | { status: 'in-use'; usage: TLanguageUsage } | { status: 'missing' };

type TUsageGroup = {
    sourceLanguageCode: string;
    targetLanguageCode: string;
    _count: number;
};

const toUsagePair = ({ sourceLanguageCode, targetLanguageCode, _count: count }: TUsageGroup): TLanguageUsagePair => ({
    sourceLanguageCode,
    targetLanguageCode,
    count,
});

@Injectable()
export class LanguageRepository extends BaseRepository {
    public constructor(
        prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {
        super(prismaService);
    }

    public async findAll(): Promise<Language[]> {
        const cached = await this.redisService.jsonGet<Language[]>(RedisPrefix.LANGUAGE, 'all');
        if (cached) {
            return cached;
        }

        const languages = await this.prisma.language.findMany({
            orderBy: {
                name: 'asc',
            },
        });

        await this.redisService.jsonSet(RedisPrefix.LANGUAGE, 'all', languages);

        return languages;
    }

    public async findById(id: string): Promise<Language | null> {
        const cached = await this.redisService.jsonGet<Language>(RedisPrefix.LANGUAGE, `id:${id}`);
        if (cached) {
            return cached;
        }

        const language = await this.prisma.language.findUnique({
            where: { id },
        });

        if (language) {
            await this.redisService.jsonSet(RedisPrefix.LANGUAGE, `id:${id}`, language);
        }

        return language;
    }

    public async findByCode(code: string): Promise<Language | null> {
        return this.prisma.language.findUnique({
            where: { code },
        });
    }

    public async create(data: Prisma.LanguageCreateInput): Promise<Language> {
        const language = await this.prisma.language.create({
            data,
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');

        return language;
    }

    public async update(id: string, data: Prisma.LanguageUpdateInput): Promise<Language> {
        const language = await this.prisma.language.update({
            where: { id },
            data,
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');
        await this.redisService.del(RedisPrefix.LANGUAGE, `id:${id}`);

        return language;
    }

    /** Every language by name, bypassing the cache. The admin catalog reads this so its counts are never stale. */
    public async findAllUncached(): Promise<Language[]> {
        return this.prisma.language.findMany({ orderBy: { name: 'asc' } });
    }

    /** Vocab rows grouped by source and target code, in one query. */
    public async findVocabLanguagePairs(): Promise<TLanguageUsagePair[]> {
        const groups = await this.prisma.vocab.groupBy({ by: ['sourceLanguageCode', 'targetLanguageCode'], _count: true });

        return groups.map(toUsagePair);
    }

    /** Language folder rows grouped by source and target code, in one query. */
    public async findFolderLanguagePairs(): Promise<TLanguageUsagePair[]> {
        const groups = await this.prisma.languageFolder.groupBy({ by: ['sourceLanguageCode', 'targetLanguageCode'], _count: true });

        return groups.map(toUsagePair);
    }

    /**
     * Deletes the language only while no vocab or folder uses it. The check and the delete run in one serializable
     * transaction, so a vocab added in between makes the transaction retry instead of cascading into the delete.
     */
    public async deleteIfUnused(id: string): Promise<TLanguageDeleteResult> {
        const result = await this.runSerializableWithRetry(async (tx): Promise<TLanguageDeleteResult> => {
            const language = await tx.language.findUnique({ where: { id } });
            if (!language) {
                return { status: 'missing' };
            }

            const usage = await this.countUsageInTransaction(tx, language.code);
            if (usage.vocabCount > 0 || usage.folderCount > 0) {
                return { status: 'in-use', usage };
            }

            return { status: 'deleted', language: await tx.language.delete({ where: { id } }) };
        });

        if (result.status === 'deleted') {
            await this.redisService.del(RedisPrefix.LANGUAGE, 'all');
            await this.redisService.del(RedisPrefix.LANGUAGE, `id:${id}`);
        }

        return result;
    }

    private async countUsageInTransaction(tx: Prisma.TransactionClient, code: string): Promise<TLanguageUsage> {
        const usesCode = { OR: [{ sourceLanguageCode: code }, { targetLanguageCode: code }] };
        const [vocabCount, folderCount] = await Promise.all([tx.vocab.count({ where: usesCode }), tx.languageFolder.count({ where: usesCode })]);

        return { vocabCount, folderCount };
    }
}
