import { Injectable } from '@nestjs/common';
import { Prisma, Vocab } from '@prisma/client';
import { PrismaService } from '../../common';
import { RedisService } from '../../common/provider/redis.provider';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { VocabQueryParamsInput } from '../model/vocab-query-params.input';

@Injectable()
export class VocabRepository {
    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    public async findWithPagination(
        query: VocabQueryParamsInput,
        userId: string,
        skip: number,
        take: number,
        orderBy: Prisma.VocabOrderByWithRelationInput,
    ): Promise<{ totalItems: number; vocabs: Vocab[] }> {
        const cacheKey = `list:${JSON.stringify({ ...query, userId })}`;

        const cached = await this.redisService.jsonGetWithPrefix<{
            totalItems: number;
            vocabs: Vocab[];
        }>(RedisPrefix.VOCAB, cacheKey);

        if (cached && cached.vocabs && Array.isArray(cached.vocabs)) {
            return cached;
        }

        // Clear invalid cache if exists
        if (cached) {
            await this.redisService.delWithPrefix(RedisPrefix.VOCAB, cacheKey);
        }

        const where = buildPrismaWhere<VocabQueryParamsInput, Prisma.VocabWhereInput>(query, {
            stringFields: [
                'textSource',
                'sourceLanguageCode',
                'targetLanguageCode',
                'userId',
                'languageFolderId',
            ],
            customMap: (input, w) => {
                if (userId) {
                    (w as Prisma.VocabWhereInput).userId = userId;
                }
                if (
                    input.subjectIds &&
                    Array.isArray(input.subjectIds) &&
                    input.subjectIds.length > 0
                ) {
                    (w as Prisma.VocabWhereInput).textTargets = {
                        some: {
                            textTargetSubjects: {
                                some: {
                                    subjectId: { in: input.subjectIds },
                                },
                            },
                        },
                    };
                }
            },
        });

        const [totalItems, vocabs] = await Promise.all([
            this.prismaService.vocab.count({ where }),
            this.prismaService.vocab.findMany({
                where,
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                    languageFolder: true,
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
                orderBy,
                skip,
                take,
            }),
        ]);

        const result = { totalItems, vocabs: vocabs || [] };
        await this.redisService.jsonSetWithPrefix(RedisPrefix.VOCAB, cacheKey, result);

        return result;
    }

    public async findRandom(
        count: number,
        userId?: string,
    ): Promise<Vocab[]> {
        const cacheKey = `random:${count}:${userId || 'all'}`;

        const cached = await this.redisService.jsonGetWithPrefix<Vocab[]>(
            RedisPrefix.VOCAB,
            cacheKey,
        );

        if (cached) {
            return cached;
        }

        const where: Prisma.VocabWhereInput = {};
        if (userId) {
            where.userId = userId;
        }

        const allIds = await this.prismaService.vocab.findMany({
            where,
            select: { id: true },
        });

        if (allIds.length === 0) {
            return [];
        }

        const shuffled = allIds.sort(() => 0.5 - Math.random());
        const selectedIds = shuffled
            .slice(0, Math.min(count, allIds.length))
            .map((x) => x.id);

        const vocabs = await this.prismaService.vocab.findMany({
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
            },
        });

        await this.redisService.jsonSetWithPrefix(RedisPrefix.VOCAB, cacheKey, vocabs, 300);

        return vocabs;
    }

    public async findById(
        id: string,
        userId?: string,
    ): Promise<Vocab | null> {
        const cached = await this.redisService.getObjectWithPrefix<Vocab>(
            RedisPrefix.VOCAB,
            `id:${id}`,
        );
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

        const vocab = await this.prismaService.vocab.findFirst({
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

        if (vocab) {
            await this.redisService.setObjectWithPrefix(RedisPrefix.VOCAB, `id:${id}`, vocab);
        }

        return vocab;
    }

    public async create(data: Prisma.VocabCreateInput): Promise<Vocab> {
        const vocab = await this.prismaService.vocab.create({
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

        await this.redisService.jsonSetWithPrefix(RedisPrefix.VOCAB, `id:${vocab.id}`, vocab);

        return vocab;
    }

    public async update(id: string, data: Prisma.VocabUpdateInput): Promise<Vocab> {
        const vocab = await this.prismaService.vocab.update({
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

        await this.redisService.jsonSetWithPrefix(RedisPrefix.VOCAB, `id:${id}`, vocab);

        return vocab;
    }

    public async delete(id: string, userId?: string): Promise<Vocab> {
        const where: Prisma.VocabWhereUniqueInput & Prisma.VocabWhereInput = { id };
        if (userId) {
            where.userId = userId;
        }

        const vocab = await this.prismaService.vocab.delete({
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

        await this.redisService.delWithPrefix(RedisPrefix.VOCAB, `id:${id}`);

        return vocab;
    }

    public async findByIds(ids: string[]): Promise<Vocab[]> {
        return this.prismaService.vocab.findMany({
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

    public async findWordTypesByNames(names: string[]): Promise<Array<{ id: string; name: string }>> {
        return this.prismaService.wordType.findMany({
            where: {
                OR: names.map((name) => ({
                    name: { contains: name, mode: 'insensitive' },
                })),
            },
            select: { id: true, name: true },
        });
    }

    public async findSubjectsByNames(names: string[], userId: string): Promise<Array<{ id: string; name: string }>> {
        return this.prismaService.subject.findMany({
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
        return this.prismaService.languageFolder.findFirst({
            where: { id, userId },
            select: { id: true },
        });
    }

    public async clearCache(): Promise<void> {
        await this.redisService.clearByPrefix(RedisPrefix.VOCAB);
    }

    public async clearCacheById(id: string): Promise<void> {
        await this.redisService.delWithPrefix(RedisPrefix.VOCAB, `id:${id}`);
    }

    public async clearListCaches(): Promise<void> {
        const listKeys = await this.redisService.getKeysByPrefix(RedisPrefix.VOCAB);
        const filteredKeys = listKeys.filter(
            (key) => key.includes('list:') || key.includes('random:'),
        );

        if (filteredKeys.length > 0) {
            await this.redisService.getClient().del(...filteredKeys);
        }
    }

    public async updateCacheFields(id: string, fields: Record<string, unknown>): Promise<void> {
        await this.redisService.updateObjectFieldsWithPrefix(RedisPrefix.VOCAB, `id:${id}`, fields);
    }
}

