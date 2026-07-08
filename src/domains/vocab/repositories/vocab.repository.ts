import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { getOrderBy } from '@/shared/utils/pagination.util';
import { buildPrismaWhere, coerceQueryStringArray } from '@/shared/utils/query-builder.util';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { Prisma, Vocab } from '@prisma/client';
import { VocabQueryParamsInput } from '../dto/vocab-query-params.input';
import { assertCsvRowData, CsvParserUtil, CsvRowData } from '../utils/csv-parser.util';

const textTargetInclude = {
    wordType: true,
    vocabExamples: true,
    textTargetSubjects: {
        include: { subject: true },
    },
} satisfies Prisma.TextTargetInclude;

const csvImportVocabInclude = {
    textTargets: {
        include: {
            wordType: true,
            textTargetSubjects: {
                include: { subject: true },
            },
        },
    },
} satisfies Prisma.VocabInclude;

export type CsvImportExistingVocab = Prisma.VocabGetPayload<{
    include: typeof csvImportVocabInclude;
}>;

export interface CsvImportGroupParams {
    textSource: string;
    textTargetRows: CsvRowData[];
    userId: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    languageFolderId: string;
    wordTypeMap: Map<string, string>;
    subjectMap: Map<string, string>;
    existingVocabMap: Map<string, CsvImportExistingVocab>;
}

interface CsvImportTextTargetData {
    textTarget: string;
    grammar: string;
    explanationSource: string;
    explanationTarget: string;
    wordTypeId?: string;
    subjectIds: string[];
    vocabExamples: Array<{ source: string; target: string }>;
}

@Injectable()
export class VocabRepository extends BaseRepository {
    public constructor(
        prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {
        super(prismaService);
    }

    public async findWithPagination(query: VocabQueryParamsInput, userId: string, skip: number, take: number): Promise<{ totalItems: number; vocabs: Vocab[] }> {
        const effectiveQuery = this.applyPresetFilter(query);
        const orderBy = getOrderBy(effectiveQuery.sortBy, effectiveQuery.sortOrder, 'createdAt') as Prisma.VocabOrderByWithRelationInput;

        // 1. Caching Layer
        const cacheKey = `list:${JSON.stringify({ ...effectiveQuery, userId })}`;
        const cached = await this.redisService.jsonGet<{
            totalItems: number;
            vocabs: Vocab[];
        }>(RedisPrefix.VOCAB, cacheKey);

        if (cached?.vocabs && Array.isArray(cached.vocabs)) return cached;
        if (cached) await this.redisService.del(RedisPrefix.VOCAB, cacheKey);

        // 2. Build WHERE Condition
        const where = this.buildVocabWhere(effectiveQuery, userId);

        // 3. Execution Strategy
        let result: { totalItems: number; vocabs: Vocab[] };
        const isMasterySort = effectiveQuery.sortBy === 'masteryScore';

        if (isMasterySort) {
            const candidates = await this.prisma.vocab.findMany({
                where,
                select: {
                    id: true,
                    vocabMasteries: {
                        where: { userId },
                        select: { masteryScore: true },
                        take: 1,
                    },
                },
            });

            // Sort in Memory
            const sortFactor = effectiveQuery.sortOrder === 'asc' ? 1 : -1;
            candidates.sort((a, b) => {
                const scoreA = a.vocabMasteries[0]?.masteryScore ?? 0;
                const scoreB = b.vocabMasteries[0]?.masteryScore ?? 0;
                return (scoreA - scoreB) * sortFactor;
            });

            // Pagination in Memory
            const totalItems = candidates.length;
            const pagedIds = candidates.slice(skip, skip + take).map((c) => c.id);

            // Fetch Full Data for the specific page
            let vocabs: Vocab[] = [];
            if (pagedIds.length > 0) {
                const unorderedVocabs = await this.prisma.vocab.findMany({
                    where: { id: { in: pagedIds } },
                    include: this.getVocabIncludes(userId),
                });

                // Restore sort order (WHERE IN does not guarantee order)
                const vocabMap = new Map(unorderedVocabs.map((v) => [v.id, v]));
                vocabs = pagedIds.map((id) => vocabMap.get(id)).filter(Boolean) as Vocab[];
            }

            result = { totalItems, vocabs };
        } else {
            // STRATEGY B: Standard Prisma (Efficient for DB-level sorting)
            const [totalItems, vocabs] = await Promise.all([
                this.prisma.vocab.count({ where }),
                this.prisma.vocab.findMany({
                    where,
                    include: this.getVocabIncludes(userId),
                    orderBy,
                    skip,
                    take,
                }),
            ]);
            result = { totalItems, vocabs: vocabs || [] };
        }

        // 4. Cache & Return
        await this.setJsonCacheSafely(cacheKey, result);
        return result;
    }

    public async findRandom(count: number, userId?: string, languageFolderId?: string): Promise<Vocab[]> {
        const where: Prisma.VocabWhereInput = {};
        if (userId) {
            where.userId = userId;
        }
        if (languageFolderId) {
            where.languageFolderId = languageFolderId;
        }

        const allIds = await this.prisma.vocab.findMany({
            where,
            select: { id: true },
        });

        if (allIds.length === 0) {
            return [];
        }

        const shuffled = allIds.sort(() => 0.5 - Math.random());
        const selectedIds = shuffled.slice(0, Math.min(count, allIds.length)).map((x) => x.id);

        const vocabs = await this.prisma.vocab.findMany({
            where: { id: { in: selectedIds } },
            include: {
                sourceLanguage: true,
                targetLanguage: true,
                textTargets: {
                    include: {
                        wordType: true,
                        vocabExamples: true,
                        textTargetSubjects: {
                            include: { subject: true },
                        },
                    },
                },
                vocabMasteries: {
                    where: {
                        userId,
                    },
                    select: {
                        masteryScore: true,
                    },
                    take: 1,
                },
            },
        });

        return vocabs;
    }

    public async findById(id: string, userId?: string): Promise<Vocab | null> {
        const cached = await this.redisService.jsonGet<Vocab>(RedisPrefix.VOCAB, `id:${id}`);
        if (cached) {
            if (userId && cached.userId !== userId) {
                return null;
            }
            return cached;
        }

        const where: Prisma.VocabWhereUniqueInput & Prisma.VocabWhereInput = { id };
        if (userId) {
            where.userId = userId;
        }

        const vocab = await this.prisma.vocab.findFirst({
            where,
            include: {
                sourceLanguage: true,
                targetLanguage: true,
                textTargets: {
                    include: {
                        wordType: true,
                        vocabExamples: true,
                        textTargetSubjects: {
                            include: {
                                subject: true,
                            },
                        },
                    },
                },
                vocabMasteries: {
                    where: {
                        userId,
                    },
                    select: {
                        masteryScore: true,
                    },
                    take: 1,
                },
            },
        });

        if (vocab) {
            await this.setJsonCacheSafely(`id:${id}`, vocab);
        }

        return vocab;
    }

    public async create(data: Prisma.VocabCreateInput): Promise<Vocab> {
        const vocab = await this.prisma.vocab.create({
            data,
            include: this.getCreateUpdateIncludes(),
        });

        await this.setJsonCacheSafely(`id:${vocab.id}`, vocab);

        return vocab;
    }

    public async createInTransaction(data: Prisma.VocabCreateInput, tx: Prisma.TransactionClient): Promise<Vocab> {
        return tx.vocab.create({
            data,
            include: this.getCreateUpdateIncludes(),
        });
    }

    public async update(id: string, data: Prisma.VocabUpdateInput): Promise<Vocab> {
        const vocab = await this.prisma.vocab.update({
            where: { id },
            data,
            include: this.getCreateUpdateIncludes(),
        });

        await this.setJsonCacheSafely(`id:${id}`, vocab);

        return vocab;
    }

    public async updateInTransaction(id: string, data: Prisma.VocabUpdateInput, tx: Prisma.TransactionClient): Promise<Vocab> {
        return tx.vocab.update({
            where: { id },
            data,
            include: this.getCreateUpdateIncludes(),
        });
    }

    public async delete(id: string, userId?: string): Promise<Vocab> {
        const where: Prisma.VocabWhereUniqueInput & Prisma.VocabWhereInput = { id };
        if (userId) {
            where.userId = userId;
        }

        const affectedRelatedWordCacheIds = await this.prisma.vocabRelatedWord.findMany({
            where: {
                OR: [{ vocabId: id }, { linkedVocabId: id }],
            },
            select: {
                vocabId: true,
                linkedVocabId: true,
            },
        });

        const vocab = await this.prisma.vocab.delete({
            where,
            include: this.getCreateUpdateIncludes(),
        });

        await this.redisService.del(RedisPrefix.VOCAB, `id:${id}`);
        const relatedCacheIds = this.getRelatedWordCacheIds(id, affectedRelatedWordCacheIds);
        await Promise.all(relatedCacheIds.map(async (vocabId) => this.redisService.del(RedisPrefix.VOCAB_RELATED, `id:${vocabId}`)));

        return vocab;
    }

    public async findByIds(ids: string[], userId: string): Promise<Vocab[]> {
        return this.findByIdsWithClient(ids, userId, this.prisma);
    }

    public async findByIdsInTransaction(ids: string[], userId: string, tx: Prisma.TransactionClient): Promise<Vocab[]> {
        return this.findByIdsWithClient(ids, userId, tx);
    }

    public async setCacheById(vocab: Vocab): Promise<void> {
        await this.setJsonCacheSafely(`id:${vocab.id}`, vocab);
    }

    public async findWordTypesByNames(names: string[]): Promise<Array<{ id: string; name: string }>> {
        return this.prisma.wordType.findMany({
            where: {
                OR: names.map((name) => ({
                    name: { contains: name, mode: 'insensitive' },
                })),
            },
            select: { id: true, name: true },
        });
    }

    public async findSubjectsByNames(names: string[], userId: string): Promise<Array<{ id: string; name: string }>> {
        return this.prisma.subject.findMany({
            where: {
                userId,
                OR: names.map((name) => ({
                    name: { equals: name, mode: 'insensitive' },
                })),
            },
            select: { id: true, name: true },
        });
    }

    public async findLanguageFolderById(id: string, userId: string): Promise<{ id: string } | null> {
        return this.prisma.languageFolder.findFirst({
            where: { id, userId },
            select: { id: true },
        });
    }

    public async findExistingVocabsForCsvImport(params: {
        userId: string;
        sourceLanguageCode: string;
        targetLanguageCode: string;
        languageFolderId: string;
        textSources: string[];
    }): Promise<CsvImportExistingVocab[]> {
        const { userId, sourceLanguageCode, targetLanguageCode, languageFolderId, textSources } = params;

        if (textSources.length === 0) {
            return [];
        }

        return this.prisma.vocab.findMany({
            where: {
                userId,
                sourceLanguageCode,
                targetLanguageCode,
                languageFolderId,
                OR: textSources.map((textSource) => ({
                    textSource: { equals: textSource, mode: 'insensitive' },
                })),
            },
            include: csvImportVocabInclude,
        });
    }

    public async executeCsvImportGroupTransaction(
        params: CsvImportGroupParams,
        transactionOptions: { maxWait: number; timeout: number },
    ): Promise<{ created: number; updated: number; vocabId: string }> {
        return this.runInTransaction(async (tx) => this.applyCsvBatchInTransaction(tx, params), transactionOptions);
    }

    /**
     * deleteMany (not delete) — this is called from job-retry/stalled-recovery paths where
     * the row may already be gone from a prior attempt; a bare delete() throws P2025 in that race.
     */
    public async deleteTextTargetById(id: string, tx?: Prisma.TransactionClient): Promise<void> {
        const client = tx ?? this.prisma;
        await client.textTarget.deleteMany({ where: { id } });
    }

    public async findTextTargetById(id: string): Promise<Prisma.TextTargetGetPayload<{ include: typeof textTargetInclude }> | null> {
        return this.prisma.textTarget.findUnique({
            where: { id },
            include: textTargetInclude,
        });
    }

    public async findTextTargetsByVocabId(
        vocabId: string,
        options?: {
            textTarget?: string;
            grammar?: string;
            wordTypeId?: string;
            sortBy?: string;
            sortOrder?: 'asc' | 'desc';
            skip?: number;
            take?: number;
        },
    ): Promise<{ totalItems: number; items: Prisma.TextTargetGetPayload<{ include: typeof textTargetInclude }>[] }> {
        const where: Prisma.TextTargetWhereInput = {
            vocabId,
            ...(options?.textTarget ? { textTarget: { contains: options.textTarget, mode: 'insensitive' } } : {}),
            ...(options?.grammar ? { grammar: { contains: options.grammar, mode: 'insensitive' } } : {}),
            ...(options?.wordTypeId ? { wordTypeId: options.wordTypeId } : {}),
        };

        const orderBy = getOrderBy(options?.sortBy, options?.sortOrder, 'createdAt') as Prisma.TextTargetOrderByWithRelationInput;

        const [totalItems, items] = await Promise.all([
            this.prisma.textTarget.count({ where }),
            this.prisma.textTarget.findMany({
                where,
                include: textTargetInclude,
                orderBy,
                skip: options?.skip,
                take: options?.take,
            }),
        ]);

        return { totalItems, items };
    }

    public async createTextTarget(
        vocabId: string,
        data: {
            wordTypeId?: string;
            textTarget: string;
            grammar: string;
            explanationSource: string;
            explanationTarget: string;
            subjectIds?: string[];
            vocabExamples?: { source: string; target: string }[];
        },
    ): Promise<Prisma.TextTargetGetPayload<{ include: typeof textTargetInclude }>> {
        const textTarget = await this.prisma.textTarget.create({
            data: {
                vocabId,
                wordTypeId: data.wordTypeId ?? null,
                textTarget: data.textTarget,
                grammar: data.grammar,
                explanationSource: data.explanationSource,
                explanationTarget: data.explanationTarget,
                textTargetSubjects: data.subjectIds?.length ? { create: data.subjectIds.map((subjectId) => ({ subjectId })) } : undefined,
                vocabExamples: data.vocabExamples?.length ? { create: data.vocabExamples.map((ex) => ({ source: ex.source, target: ex.target })) } : undefined,
            },
            include: textTargetInclude,
        });

        await Promise.all([this.clearCacheById(vocabId), this.clearListCaches()]);

        return textTarget;
    }

    public async updateTextTarget(
        vocabId: string,
        id: string,
        data: {
            wordTypeId?: string;
            textTarget?: string;
            grammar?: string;
            explanationSource?: string;
            explanationTarget?: string;
            subjectIds?: string[];
            vocabExamples?: { source: string; target: string }[];
        },
    ): Promise<Prisma.TextTargetGetPayload<{ include: typeof textTargetInclude }>> {
        const textTarget = await this.runInTransaction(async (tx) => {
            if (data.subjectIds !== undefined) {
                await tx.textTargetSubject.deleteMany({ where: { textTargetId: id } });
            }
            if (data.vocabExamples !== undefined) {
                await tx.vocabExample.deleteMany({ where: { textTargetId: id } });
            }

            return tx.textTarget.update({
                where: { id },
                data: {
                    wordTypeId: data.wordTypeId,
                    textTarget: data.textTarget,
                    grammar: data.grammar,
                    explanationSource: data.explanationSource,
                    explanationTarget: data.explanationTarget,
                    textTargetSubjects: data.subjectIds?.length ? { create: data.subjectIds.map((subjectId) => ({ subjectId })) } : undefined,
                    vocabExamples: data.vocabExamples?.length ? { create: data.vocabExamples.map((ex) => ({ source: ex.source, target: ex.target })) } : undefined,
                },
                include: textTargetInclude,
            });
        });

        await Promise.all([this.clearCacheById(vocabId), this.clearListCaches()]);

        return textTarget;
    }

    public async clearCache(): Promise<void> {
        await this.redisService.clearByPrefix(RedisPrefix.VOCAB);
    }

    public async clearCacheById(id: string): Promise<void> {
        await this.redisService.del(RedisPrefix.VOCAB, `id:${id}`);
    }

    public async clearListCaches(): Promise<void> {
        const listKeys = await this.redisService.getKeysByPrefix(RedisPrefix.VOCAB);
        const filteredKeys = listKeys.filter((key) => key.includes('list:') || key.includes('random:'));

        if (filteredKeys.length > 0) {
            await this.redisService.client.del(...filteredKeys);
        }
    }

    public async updateCacheFields(id: string, fields: Record<string, unknown>): Promise<void> {
        const cached = await this.redisService.jsonGet<Vocab>(RedisPrefix.VOCAB, `id:${id}`);

        if (cached) {
            const updated = { ...cached, ...fields };
            await this.setJsonCacheSafely(`id:${id}`, updated);
        }
    }

    public async countByUserId(userId: string): Promise<number> {
        return this.prisma.vocab.count({
            where: { userId },
        });
    }

    public async countVocabsBySubjectId(subjectId: string, userId: string): Promise<number> {
        return this.prisma.vocab.count({
            where: {
                userId,
                textTargets: {
                    some: {
                        textTargetSubjects: {
                            some: { subjectId },
                        },
                    },
                },
            },
        });
    }

    public async findVocabsBySubjectId(subjectId: string, userId: string, skip: number, take: number, orderBy: Prisma.VocabOrderByWithRelationInput): Promise<Vocab[]> {
        return this.prisma.vocab.findMany({
            where: {
                userId,
                textTargets: {
                    some: {
                        textTargetSubjects: {
                            some: { subjectId },
                        },
                    },
                },
            },
            include: {
                sourceLanguage: true,
                targetLanguage: true,
                languageFolder: true,
                textTargets: {
                    include: {
                        wordType: true,
                        vocabExamples: true,
                        textTargetSubjects: { include: { subject: true } },
                    },
                },
                vocabMasteries: {
                    where: { userId },
                    select: { masteryScore: true },
                    take: 1,
                },
            },
            skip,
            take,
            orderBy,
        });
    }

    private async applyCsvBatchInTransaction(tx: Prisma.TransactionClient, params: CsvImportGroupParams): Promise<{ created: number; updated: number; vocabId: string }> {
        const { textSource, textTargetRows, userId, sourceLanguageCode, targetLanguageCode, languageFolderId, wordTypeMap, subjectMap, existingVocabMap } = params;

        const mapKey = `${textSource}:${languageFolderId}`;
        const existingVocab = existingVocabMap.get(mapKey);

        const textTargetsData = textTargetRows.map((row: CsvRowData) => {
            const typedRow = assertCsvRowData(row);

            let wordTypeId: string | undefined;
            if (typedRow.wordType) {
                const nameKey = typedRow.wordType.toLowerCase();
                wordTypeId = wordTypeMap.get(nameKey);
                if (!wordTypeId) {
                    throw new Error(`Word type '${typedRow.wordType}' not found`);
                }
            }

            const subjectIds: string[] = [];
            if (typedRow.subjects) {
                const subjectNames = CsvParserUtil.parseSubjects(typedRow.subjects);
                subjectNames.forEach((subjectName) => {
                    const nameKey = subjectName.toLowerCase();
                    const subjectId = subjectMap.get(nameKey);
                    if (!subjectId) {
                        throw new Error(`Subject '${subjectName}' not found`);
                    }
                    subjectIds.push(subjectId);
                });
            }

            return {
                textTarget: typedRow.textTarget,
                grammar: typedRow.grammar || '',
                explanationSource: typedRow.explanationSource || '',
                explanationTarget: typedRow.explanationTarget || '',
                wordTypeId,
                subjectIds,
                vocabExamples: typedRow.exampleSource && typedRow.exampleTarget ? [{ source: typedRow.exampleSource, target: typedRow.exampleTarget }] : [],
            };
        });
        const uniqueTextTargetsData = this.dedupeCsvImportTextTargets(textTargetsData);

        if (existingVocab) {
            const existingTextTargetKeys = new Set(existingVocab.textTargets.map((tt) => this.normalizeCsvImportText(tt.textTarget)));

            for (const textTargetData of uniqueTextTargetsData) {
                const normalizedTextTarget = this.normalizeCsvImportText(textTargetData.textTarget);

                if (!existingTextTargetKeys.has(normalizedTextTarget)) {
                    await tx.textTarget.create({
                        data: {
                            vocabId: existingVocab.id,
                            textTarget: textTargetData.textTarget,
                            grammar: textTargetData.grammar,
                            explanationSource: textTargetData.explanationSource,
                            explanationTarget: textTargetData.explanationTarget,
                            wordTypeId: textTargetData.wordTypeId,
                            textTargetSubjects: {
                                create: textTargetData.subjectIds.map((subjectId: string) => ({
                                    subjectId,
                                })),
                            },
                            vocabExamples: {
                                create: textTargetData.vocabExamples.map((example: { source: string; target: string }) => ({
                                    source: example.source,
                                    target: example.target,
                                })),
                            },
                        },
                    });
                    existingTextTargetKeys.add(normalizedTextTarget);
                }
            }
            return { created: 0, updated: 1, vocabId: existingVocab.id };
        }

        const createdVocab = await tx.vocab.create({
            data: {
                textSource,
                sourceLanguageCode,
                targetLanguageCode,
                languageFolderId,
                userId,
                textTargets: {
                    create: uniqueTextTargetsData.map((textTargetData) => ({
                        textTarget: textTargetData.textTarget,
                        grammar: textTargetData.grammar,
                        explanationSource: textTargetData.explanationSource,
                        explanationTarget: textTargetData.explanationTarget,
                        wordTypeId: textTargetData.wordTypeId,
                        textTargetSubjects: {
                            create: textTargetData.subjectIds.map((subjectId: string) => ({
                                subjectId,
                            })),
                        },
                        vocabExamples: {
                            create: textTargetData.vocabExamples.map((example: { source: string; target: string }) => ({
                                source: example.source,
                                target: example.target,
                            })),
                        },
                    })),
                },
            },
            select: { id: true },
        });
        return { created: 1, updated: 0, vocabId: createdVocab.id };
    }

    private dedupeCsvImportTextTargets(textTargetsData: CsvImportTextTargetData[]): CsvImportTextTargetData[] {
        const deduped = new Map<string, CsvImportTextTargetData>();

        for (const textTargetData of textTargetsData) {
            const normalizedTextTarget = this.normalizeCsvImportText(textTargetData.textTarget);
            if (!deduped.has(normalizedTextTarget)) {
                deduped.set(normalizedTextTarget, textTargetData);
            }
        }

        return Array.from(deduped.values());
    }

    private normalizeCsvImportText(value: string): string {
        return value.toLowerCase();
    }

    private getRelatedWordCacheIds(id: string, rows: Array<{ vocabId: string; linkedVocabId: string | null }>): string[] {
        return [...new Set([id, ...rows.flatMap((row) => (row.linkedVocabId ? [row.vocabId, row.linkedVocabId] : [row.vocabId]))])];
    }

    private async setJsonCacheSafely(key: string, data: unknown, ttl?: number): Promise<void> {
        try {
            await this.redisService.jsonSet(RedisPrefix.VOCAB, key, data, ttl);
        } catch (error) {
            if (error instanceof Error && error.message.includes('wrong Redis type')) {
                await this.redisService.del(RedisPrefix.VOCAB, key);
                await this.redisService.jsonSet(RedisPrefix.VOCAB, key, data, ttl);
            } else {
                throw error;
            }
        }
    }

    private applyPresetFilter(query: VocabQueryParamsInput): VocabQueryParamsInput {
        switch (query.filter) {
            case 'recent':
                return query.sortBy ? query : { ...query, sortBy: 'createdAt', sortOrder: 'desc' };
            case 'difficult':
                return query.sortBy ? query : { ...query, sortBy: 'masteryScore', sortOrder: 'asc' };
            case 'unstarted':
                return query;
            default:
                return query;
        }
    }

    private buildVocabWhere(query: VocabQueryParamsInput, userId: string): Prisma.VocabWhereInput {
        return buildPrismaWhere<VocabQueryParamsInput, Prisma.VocabWhereInput>(query, {
            stringFields: ['textSource', 'sourceLanguageCode', 'targetLanguageCode', 'userId', 'languageFolderId'],
            customMap: (input, where) => {
                where.userId = userId;
                this.applySubjectFilter(input, where);
                this.applyPresetWhereFilter(input, userId, where);
            },
        });
    }

    private applySubjectFilter(query: VocabQueryParamsInput, where: Partial<Prisma.VocabWhereInput>): void {
        const subjectIds = coerceQueryStringArray(query.subjectIds);

        if (!subjectIds.length) {
            return;
        }

        where.textTargets = {
            some: {
                textTargetSubjects: { some: { subjectId: { in: subjectIds } } },
            },
        };
    }

    private applyPresetWhereFilter(query: VocabQueryParamsInput, userId: string, where: Partial<Prisma.VocabWhereInput>): void {
        switch (query.filter) {
            case 'recent':
                where.createdAt = {
                    gte: this.getRecentCreatedAtThreshold(),
                };
                return;
            case 'difficult':
                where.vocabMasteries = {
                    some: {
                        userId,
                        masteryScore: { gt: 0 },
                    },
                };
                return;
            case 'unstarted':
                where.OR = [{ vocabMasteries: { none: { userId } } }, { vocabMasteries: { some: { userId, masteryScore: 0 } } }];
                return;
            default:
                return;
        }
    }

    private getRecentCreatedAtThreshold(): Date {
        const millisecondsPerDay = 24 * 60 * 60 * 1000;

        return new Date(Date.now() - millisecondsPerDay);
    }

    private getVocabIncludes(userId: string): Prisma.VocabInclude {
        return {
            sourceLanguage: true,
            targetLanguage: true,
            languageFolder: true,
            textTargets: {
                include: {
                    wordType: true,
                    vocabExamples: true,
                    textTargetSubjects: { include: { subject: true } },
                },
            },
            vocabMasteries: {
                where: { userId },
                select: { masteryScore: true },
                take: 1,
            },
        };
    }

    private async findByIdsWithClient(ids: string[], userId: string, client: PrismaService | Prisma.TransactionClient): Promise<Vocab[]> {
        if (ids.length === 0) {
            return [];
        }

        return client.vocab.findMany({
            where: { id: { in: ids }, userId },
            include: {
                sourceLanguage: true,
                targetLanguage: true,
                textTargets: {
                    include: {
                        wordType: true,
                        vocabExamples: true,
                        textTargetSubjects: {
                            include: {
                                subject: true,
                            },
                        },
                    },
                },
                vocabMasteries: {
                    where: {
                        userId,
                    },
                    select: {
                        masteryScore: true,
                    },
                    take: 1,
                },
            },
        });
    }

    private getCreateUpdateIncludes(): Prisma.VocabInclude {
        return {
            sourceLanguage: true,
            targetLanguage: true,
            textTargets: {
                include: {
                    wordType: true,
                    vocabExamples: true,
                    textTargetSubjects: {
                        include: {
                            subject: true,
                        },
                    },
                },
            },
        };
    }
}
