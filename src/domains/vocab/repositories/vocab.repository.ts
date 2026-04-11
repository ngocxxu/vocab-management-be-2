import { Injectable } from '@nestjs/common';
import { Prisma, Vocab } from '@prisma/client';
import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { buildPrismaWhere, coerceQueryStringArray } from '@/shared/utils/query-builder.util';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { VocabQueryParamsInput } from '../dto/vocab-query-params.input';
import { assertCsvRowData, CsvParserUtil, CsvRowData } from '../utils/csv-parser.util';

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

@Injectable()
export class VocabRepository extends BaseRepository {
    public constructor(prismaService: PrismaService, private readonly redisService: RedisService) {
        super(prismaService);
    }

    public async findWithPagination(
        query: VocabQueryParamsInput,
        userId: string,
        skip: number,
        take: number,
        orderBy: Prisma.VocabOrderByWithRelationInput,
    ): Promise<{ totalItems: number; vocabs: Vocab[] }> {
        // 1. Caching Layer
        const cacheKey = `list:${JSON.stringify({ ...query, userId })}`;
        const cached = await this.redisService.jsonGet<{
            totalItems: number;
            vocabs: Vocab[];
        }>(RedisPrefix.VOCAB, cacheKey);

        if (cached?.vocabs && Array.isArray(cached.vocabs)) return cached;
        if (cached) await this.redisService.del(RedisPrefix.VOCAB, cacheKey);

        // 2. Build WHERE Condition
        const where = buildPrismaWhere<VocabQueryParamsInput, Prisma.VocabWhereInput>(query, {
            stringFields: [
                'textSource',
                'sourceLanguageCode',
                'targetLanguageCode',
                'userId',
                'languageFolderId',
            ],
            customMap: (input, w) => {
                if (userId) (w as Prisma.VocabWhereInput).userId = userId;
                const subjectIds = coerceQueryStringArray(input.subjectIds);
                if (subjectIds.length) {
                    (w as Prisma.VocabWhereInput).textTargets = {
                        some: {
                            textTargetSubjects: { some: { subjectId: { in: subjectIds } } },
                        },
                    };
                }
            },
        });

        // 3. Execution Strategy
        let result: { totalItems: number; vocabs: Vocab[] };
        const isMasterySort = query.sortBy === 'masteryScore';

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
            const sortFactor = query.sortOrder === 'asc' ? 1 : -1;
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

    public async findRandom(
        count: number,
        userId?: string,
        languageFolderId?: string,
    ): Promise<Vocab[]> {
        const cacheKey = `random:${count}:${userId || 'all'}:${languageFolderId || 'all'}`;

        const cached = await this.redisService.jsonGet<Vocab[]>(RedisPrefix.VOCAB, cacheKey);

        if (cached) {
            return cached;
        }

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

        await this.setJsonCacheSafely(cacheKey, vocabs, 300);

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
            },
        });

        await this.setJsonCacheSafely(`id:${vocab.id}`, vocab);

        return vocab;
    }

    public async update(id: string, data: Prisma.VocabUpdateInput): Promise<Vocab> {
        const vocab = await this.prisma.vocab.update({
            where: { id },
            data,
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
            },
        });

        await this.setJsonCacheSafely(`id:${id}`, vocab);

        return vocab;
    }

    public async delete(id: string, userId?: string): Promise<Vocab> {
        const where: Prisma.VocabWhereUniqueInput & Prisma.VocabWhereInput = { id };
        if (userId) {
            where.userId = userId;
        }

        const vocab = await this.prisma.vocab.delete({
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
            },
        });

        await this.redisService.del(RedisPrefix.VOCAB, `id:${id}`);

        return vocab;
    }

    public async findByIds(ids: string[]): Promise<Vocab[]> {
        return this.prisma.vocab.findMany({
            where: { id: { in: ids } },
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
            },
        });
    }

    public async findWordTypesByNames(
        names: string[],
    ): Promise<Array<{ id: string; name: string }>> {
        return this.prisma.wordType.findMany({
            where: {
                OR: names.map((name) => ({
                    name: { contains: name, mode: 'insensitive' },
                })),
            },
            select: { id: true, name: true },
        });
    }

    public async findSubjectsByNames(
        names: string[],
        userId: string,
    ): Promise<Array<{ id: string; name: string }>> {
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

    public async findLanguageFolderById(
        id: string,
        userId: string,
    ): Promise<{ id: string } | null> {
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
        const { userId, sourceLanguageCode, targetLanguageCode, languageFolderId, textSources } =
            params;

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
    ): Promise<{ created: number; updated: number }> {
        return this.runInTransaction(
            async (tx) => this.applyCsvBatchInTransaction(tx, params),
            transactionOptions,
        );
    }

    public async deleteTextTargetById(
        id: string,
        tx?: Prisma.TransactionClient,
    ): Promise<void> {
        const client = tx ?? this.prisma;
        await client.textTarget.delete({ where: { id } });
    }

    private async applyCsvBatchInTransaction(
        tx: Prisma.TransactionClient,
        params: CsvImportGroupParams,
    ): Promise<{ created: number; updated: number }> {
        const {
            textSource,
            textTargetRows,
            userId,
            sourceLanguageCode,
            targetLanguageCode,
            languageFolderId,
            wordTypeMap,
            subjectMap,
            existingVocabMap,
        } = params;

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
                vocabExamples:
                    typedRow.exampleSource && typedRow.exampleTarget
                        ? [{ source: typedRow.exampleSource, target: typedRow.exampleTarget }]
                        : [],
            };
        });

        if (existingVocab) {
            for (const textTargetData of textTargetsData) {
                const existingTextTarget = existingVocab.textTargets.find(
                    (tt) => tt.textTarget === textTargetData.textTarget,
                );

                if (!existingTextTarget) {
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
                                create: textTargetData.vocabExamples.map(
                                    (example: { source: string; target: string }) => ({
                                        source: example.source,
                                        target: example.target,
                                    }),
                                ),
                            },
                        },
                    });
                }
            }
            return { created: 0, updated: 1 };
        }

        await tx.vocab.create({
            data: {
                textSource,
                sourceLanguageCode,
                targetLanguageCode,
                languageFolderId,
                userId,
                textTargets: {
                    create: textTargetsData.map((textTargetData) => ({
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
                            create: textTargetData.vocabExamples.map(
                                (example: { source: string; target: string }) => ({
                                    source: example.source,
                                    target: example.target,
                                }),
                            ),
                        },
                    })),
                },
            },
        });
        return { created: 1, updated: 0 };
    }

    public async clearCache(): Promise<void> {
        await this.redisService.clearByPrefix(RedisPrefix.VOCAB);
    }

    public async clearCacheById(id: string): Promise<void> {
        await this.redisService.del(RedisPrefix.VOCAB, `id:${id}`);
    }

    public async clearListCaches(): Promise<void> {
        const listKeys = await this.redisService.getKeysByPrefix(RedisPrefix.VOCAB);
        const filteredKeys = listKeys.filter(
            (key) => key.includes('list:') || key.includes('random:'),
        );

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
}
