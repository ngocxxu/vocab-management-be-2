import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const vocabRelatedWordInclude = {
    linkedVocab: {
        select: {
            id: true,
            textSource: true,
            userId: true,
            languageFolderId: true,
        },
    },
} satisfies Prisma.VocabRelatedWordInclude;

export type VocabRelatedWordWithLinkedVocab = Prisma.VocabRelatedWordGetPayload<{
    include: typeof vocabRelatedWordInclude;
}>;

@Injectable()
export class VocabRelatedWordRepository extends BaseRepository {
    private static readonly CACHE_TTL_SECONDS = 300;

    public constructor(
        prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {
        super(prismaService);
    }

    public async findByVocabId(vocabId: string): Promise<VocabRelatedWordWithLinkedVocab[]> {
        const cacheKey = this.buildCacheKey(vocabId);
        const cached = await this.redisService.jsonGet<VocabRelatedWordWithLinkedVocab[]>(RedisPrefix.VOCAB_RELATED, cacheKey);

        if (cached) {
            return cached;
        }

        const rows = await this.prisma.vocabRelatedWord.findMany({
            where: { vocabId },
            include: vocabRelatedWordInclude,
        });

        rows.sort((left, right) => {
            const leftWord = (left.linkedVocab?.textSource ?? left.freeText ?? '').toLocaleLowerCase();
            const rightWord = (right.linkedVocab?.textSource ?? right.freeText ?? '').toLocaleLowerCase();

            if (leftWord !== rightWord) {
                return leftWord.localeCompare(rightWord);
            }

            return left.createdAt.getTime() - right.createdAt.getTime();
        });

        await this.redisService.jsonSet(RedisPrefix.VOCAB_RELATED, cacheKey, rows, VocabRelatedWordRepository.CACHE_TTL_SECONDS);

        return rows;
    }

    public async findByVocabIds(vocabIds: string[]): Promise<Map<string, VocabRelatedWordWithLinkedVocab[]>> {
        if (vocabIds.length === 0) {
            return new Map<string, VocabRelatedWordWithLinkedVocab[]>();
        }

        const uniqueVocabIds = [...new Set(vocabIds)];
        const rows = await Promise.all(uniqueVocabIds.map(async (vocabId) => ({ vocabId, rows: await this.findByVocabId(vocabId) })));

        return new Map(rows.map(({ vocabId, rows: relatedRows }) => [vocabId, relatedRows]));
    }

    public async findByIdAndVocabId(id: string, vocabId: string): Promise<VocabRelatedWordWithLinkedVocab | null> {
        return this.prisma.vocabRelatedWord.findFirst({
            where: { id, vocabId },
            include: vocabRelatedWordInclude,
        });
    }

    public async autocomplete(params: { userId: string; languageFolderId: string; query: string; excludeIds: string[] }): Promise<Array<{ id: string; textSource: string }>> {
        const { userId, languageFolderId, query, excludeIds } = params;

        return this.prisma.vocab.findMany({
            where: {
                userId,
                languageFolderId,
                textSource: { contains: query, mode: 'insensitive' },
                id: { notIn: excludeIds },
            },
            select: {
                id: true,
                textSource: true,
            },
            orderBy: {
                textSource: 'asc',
            },
            take: 10,
        });
    }

    public async upsertSymmetricSet(
        vocabId: string,
        words: Array<{
            linkedVocabId?: string;
            freeText?: string;
            isSynonym: boolean;
            isAntonym: boolean;
            isRelated: boolean;
        }>,
    ): Promise<void> {
        const affectedVocabIds = await this.runInTransaction(async (tx) => this.upsertSymmetricSetInTransaction(tx, vocabId, words));

        // Step 9: Clear related-word caches after the transaction commits.
        await this.clearCacheByVocabIds(affectedVocabIds);
    }

    public async upsertSymmetricSetInTransaction(
        tx: Prisma.TransactionClient,
        vocabId: string,
        words: Array<{
            linkedVocabId?: string;
            freeText?: string;
            isSynonym: boolean;
            isAntonym: boolean;
            isRelated: boolean;
        }>,
    ): Promise<string[]> {
        // Step 1: Lock the source vocab and all requested neighbors first.
        const inputNeighborIds = this.getLinkedVocabIds(words);
        const preliminaryLockIds = this.getUniqueSortedIds([vocabId, ...inputNeighborIds]);
        await this.lockRelatedVocabs(tx, preliminaryLockIds);

        // Step 2: Read the current neighbor set after the initial locks.
        const currentRows = await tx.vocabRelatedWord.findMany({
            where: { vocabId },
            select: { linkedVocabId: true, freeText: true },
        });

        const currentNeighborIds = this.getLinkedVocabIds(currentRows);

        // Step 3: Lock stale neighbors discovered from the current DB state.
        const additionalLockIds = currentNeighborIds.filter((id: string) => !preliminaryLockIds.includes(id)).sort();
        await this.lockRelatedVocabs(tx, additionalLockIds);

        // Step 4: Calculate which existing neighbors must be removed.
        const nextNeighborIds = inputNeighborIds;
        const staleNeighborIds = currentNeighborIds.filter((id: string) => !nextNeighborIds.includes(id));

        // Step 5: Delete stale mirrored linked relations.
        if (staleNeighborIds.length > 0) {
            await tx.vocabRelatedWord.deleteMany({
                where: {
                    OR: staleNeighborIds.flatMap((linkedVocabId: string) => [
                        { vocabId, linkedVocabId },
                        { vocabId: linkedVocabId, linkedVocabId: vocabId },
                    ]),
                },
            });
        }

        // Step 6: Replace all source-side relations.
        await tx.vocabRelatedWord.deleteMany({
            where: { vocabId },
        });

        if (words.length > 0) {
            await tx.vocabRelatedWord.createMany({
                data: words.map((word) => ({
                    vocabId,
                    linkedVocabId: word.linkedVocabId ?? null,
                    freeText: word.freeText ?? null,
                    isSynonym: word.isSynonym,
                    isAntonym: word.isAntonym,
                    isRelated: word.isRelated,
                })),
            });
        }

        // Step 7: Recreate the requested mirrored linked relations.
        for (const word of words) {
            if (!word.linkedVocabId) {
                continue;
            }

            await tx.vocabRelatedWord.deleteMany({
                where: {
                    vocabId: word.linkedVocabId,
                    linkedVocabId: vocabId,
                },
            });

            await tx.vocabRelatedWord.create({
                data: {
                    vocabId: word.linkedVocabId,
                    linkedVocabId: vocabId,
                    freeText: null,
                    isSynonym: word.isSynonym,
                    isAntonym: word.isAntonym,
                    isRelated: word.isRelated,
                },
            });
        }

        // Step 8: Return every touched vocab ID for cache invalidation.
        return this.getUniqueSortedIds([vocabId, ...currentNeighborIds, ...nextNeighborIds]);
    }

    public async deleteSymmetricPair(id: string, vocabId: string): Promise<void> {
        const affectedVocabIds = await this.runInTransaction(async (tx) => {
            const row = await tx.vocabRelatedWord.findFirst({
                where: { id, vocabId },
                select: { vocabId: true, linkedVocabId: true },
            });

            if (!row) {
                return [];
            }

            const lockIds = this.getUniqueSortedIds([row.vocabId, row.linkedVocabId]);
            await this.lockRelatedVocabs(tx, lockIds);

            if (row.linkedVocabId) {
                await tx.vocabRelatedWord.deleteMany({
                    where: {
                        OR: [
                            { vocabId: row.vocabId, linkedVocabId: row.linkedVocabId },
                            { vocabId: row.linkedVocabId, linkedVocabId: row.vocabId },
                        ],
                    },
                });

                return [row.vocabId, row.linkedVocabId];
            }

            await tx.vocabRelatedWord.delete({
                where: { id },
            });

            return [row.vocabId];
        });

        await this.clearCacheByVocabIds(affectedVocabIds);
    }

    public async upgradeFreeTextToLinkedInTransaction(
        tx: Prisma.TransactionClient,
        newVocab: {
            id: string;
            textSource: string;
            languageFolderId: string;
            userId: string;
            sourceLanguageCode: string;
            targetLanguageCode: string;
        },
    ): Promise<string[]> {
        const matchingRows = await tx.vocabRelatedWord.findMany({
            where: {
                freeText: { equals: newVocab.textSource, mode: 'insensitive' },
                linkedVocabId: null,
                vocab: {
                    userId: newVocab.userId,
                    languageFolderId: newVocab.languageFolderId,
                    sourceLanguageCode: newVocab.sourceLanguageCode,
                    targetLanguageCode: newVocab.targetLanguageCode,
                },
            },
            select: { id: true, vocabId: true, isSynonym: true, isAntonym: true, isRelated: true },
        });

        if (matchingRows.length === 0) return [];

        const affectedVocabIds: string[] = [newVocab.id];

        for (const row of matchingRows) {
            await tx.vocabRelatedWord.update({
                where: { id: row.id },
                data: { freeText: null, linkedVocabId: newVocab.id },
            });

            await tx.vocabRelatedWord.create({
                data: {
                    vocabId: newVocab.id,
                    linkedVocabId: row.vocabId,
                    freeText: null,
                    isSynonym: row.isSynonym,
                    isAntonym: row.isAntonym,
                    isRelated: row.isRelated,
                },
            });

            affectedVocabIds.push(row.vocabId);
        }

        return this.getUniqueSortedIds(affectedVocabIds);
    }

    public async clearCacheByVocabIds(vocabIds: string[]): Promise<void> {
        const uniqueIds = this.getUniqueSortedIds(vocabIds);

        await Promise.all(uniqueIds.map(async (vocabId) => this.redisService.del(RedisPrefix.VOCAB_RELATED, this.buildCacheKey(vocabId))));
    }

    private getLinkedVocabIds(rows: Array<{ linkedVocabId?: string | null }>): string[] {
        return rows.map((row) => row.linkedVocabId).filter((linkedVocabId): linkedVocabId is string => Boolean(linkedVocabId));
    }

    private getUniqueSortedIds(ids: Array<string | null | undefined>): string[] {
        return [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
    }

    private async lockRelatedVocabs(tx: Prisma.TransactionClient, vocabIds: string[]): Promise<void> {
        for (const vocabId of vocabIds) {
            await tx.$executeRaw(
                Prisma.sql`SELECT pg_advisory_xact_lock(
                    ('x' || substr(md5(${`vocab-related:${vocabId}`}), 1, 16))::bit(64)::bigint
                )`,
            );
        }
    }

    private buildCacheKey(vocabId: string): string {
        return `id:${vocabId}`;
    }
}
