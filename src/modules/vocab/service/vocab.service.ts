import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vocab } from '@prisma/client';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { PaginationDto } from '../../common/model/pagination.dto';
import { RedisService } from '../../common/provider/redis.provider';
import { getOrderBy, getPagination } from '../../common/util/pagination.util';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { VocabDto, VocabInput } from '../model';
import { VocabQueryParamsInput } from '../model/vocab-query-params.input';

@Injectable()
export class VocabService {
    // Custom error mapping cho Vocab
    private readonly vocabErrorMapping = {
        P2002: 'Vocabulary with this text source and language combination already exists',
        P2025: {
            update: 'Vocabulary not found',
            delete: 'Vocabulary not found',
            findOne: 'Vocabulary not found',
            create: 'One or more related entities not found (language, word type, or subject)',
            find: 'Vocabulary not found',
            createBulk: 'One or more related entities not found (language, word type, or subject)',
            deleteBulk: 'One or more related entities not found (language, word type, or subject)',
            findRandom: 'One or more related entities not found (language, word type, or subject)',
        },
        P2003: 'Invalid language ID, word type ID, or subject ID provided',
    };

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Find all vocabularies in the database (paginated)
     * @returns Promise<PaginationDto<VocabDto>> Paginated vocabulary DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(query: VocabQueryParamsInput): Promise<PaginationDto<VocabDto>> {
        try {
            const { page, pageSize, skip, take } = getPagination({
                page: query.page,
                pageSize: query.pageSize,
                defaultPage: PaginationDto.DEFAULT_PAGE,
                defaultPageSize: PaginationDto.DEFAULT_PAGE_SIZE,
            });

            const orderBy = getOrderBy(
                query.sortBy,
                query.sortOrder,
                'createdAt',
            ) as Prisma.VocabOrderByWithRelationInput;

            const where = buildPrismaWhere<VocabQueryParamsInput, Prisma.VocabWhereInput>(query, {
                stringFields: ['textSource', 'sourceLanguageCode', 'targetLanguageCode', 'userId'],
                customMap: (input, w) => {
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

            const items = vocabs.map((vocab) => new VocabDto({ ...vocab }));
            return new PaginationDto<VocabDto>(items, totalItems, page, pageSize);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.vocabErrorMapping);
        }
    }

    /**
     * Find random vocabularies
     * @param count - The number of vocabularies to find
     * @returns Promise<VocabDto[]> The random vocabularies DTOs
     */
    public async findRandom(count: number): Promise<VocabDto[]> {
        try {
            const allIds = await this.prismaService.vocab.findMany({ select: { id: true } });

            if (allIds.length < count) {
                throw new Error('Not enough vocabularies to select from');
            }

            if (allIds.length === 0) return [];
            const shuffled = allIds.sort(() => 0.5 - Math.random());
            const selectedIds = shuffled.slice(0, Math.min(count, allIds.length)).map((x) => x.id);

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
            return vocabs.map((vocab) => new VocabDto({ ...vocab }));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'findRandom', this.vocabErrorMapping);
            throw error;
        }
    }

    /**
     * Find a single vocabulary by ID
     * @param id - The vocabulary ID to search for
     * @returns Promise<VocabDto> The vocabulary DTO
     * @throws NotFoundException when vocabulary is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<VocabDto> {
        try {
            const cached = await this.redisService.getObjectWithPrefix<Vocab>(
                RedisPrefix.VOCAB,
                `id:${id}`,
            );
            if (cached) {
                return new VocabDto(cached);
            }

            const vocab = await this.prismaService.vocab.findUnique({
                where: { id },
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

            if (!vocab) {
                throw new NotFoundException(`Vocabulary with ID ${id} not found`);
            }

            await this.redisService.setObjectWithPrefix(RedisPrefix.VOCAB, `id:${id}`, vocab);

            return new VocabDto(vocab);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.vocabErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new vocabulary record with text targets and vocabExamples
     * @param createVocabData - The vocabulary input data
     * @returns Promise<VocabDto> The created vocabulary DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(createVocabData: VocabInput, userId: string): Promise<VocabDto> {
        try {
            const { textSource, sourceLanguageCode, targetLanguageCode, textTargets }: VocabInput =
                createVocabData;

            // Validate that source and target languages are different
            if (sourceLanguageCode === targetLanguageCode) {
                throw new Error('Source and target languages must be different');
            }

            const vocab = await this.prismaService.vocab.create({
                data: {
                    textSource,
                    sourceLanguageCode,
                    targetLanguageCode,
                    textTargets: {
                        create: textTargets.map((target) => ({
                            textTarget: target.textTarget,
                            grammar: target.grammar,
                            explanationSource: target.explanationSource,
                            explanationTarget: target.explanationTarget,
                            ...(target.subjectIds && {
                                textTargetSubjects: {
                                    create: target.subjectIds.map((subjectId: string) => ({
                                        subjectId,
                                    })),
                                },
                            }),

                            ...(target.wordTypeId && {
                                wordType: { connect: { id: target.wordTypeId } },
                            }),

                            ...(target.vocabExamples && {
                                vocabExamples: {
                                    create: target.vocabExamples.map((example) => ({
                                        source: example.source,
                                        target: example.target,
                                    })),
                                },
                            }),
                        })),
                    },
                    userId,
                },
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

            const vocabDto = new VocabDto({
                ...vocab,
            });

            // Cache the new vocab as RedisJSON
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.VOCAB,
                `id:${vocabDto.id}`,
                vocabDto,
            );

            return vocabDto;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.vocabErrorMapping);
        }
    }

    public async createBulk(createVocabData: VocabInput[], userId: string): Promise<VocabDto[]> {
        try {
            const vocabDtos = await Promise.all(
                createVocabData.map(async (data) => this.create(data, userId)),
            );

            if (vocabDtos.length !== createVocabData.length) {
                throw new Error('Failed to create all vocabularies');
            }

            await this.clearVocabCache();

            return vocabDtos;
        } catch (error: unknown) {
            await this.clearVocabCache();
            PrismaErrorHandler.handle(error, 'createBulk', this.vocabErrorMapping);
            throw error;
        }
    }

    /**
     * Update a vocabulary record
     * @param id - The vocabulary ID to update
     * @param updateVocabData - Partial vocabulary input data
     * @returns Promise<VocabDto> The updated vocabulary DTO
     * @throws NotFoundException when vocabulary is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(
        id: string,
        updateVocabData: Partial<VocabInput>,
        userId: string,
    ): Promise<VocabDto> {
        try {
            // First, verify the vocab exists and belongs to the user
            const existingVocab = await this.prismaService.vocab.findFirst({
                where: {
                    id,
                    userId,
                },
            });

            if (!existingVocab) {
                throw new Error('Vocab not found or unauthorized');
            }

            // Validate that source and target languages are different if both are provided
            if (
                updateVocabData.sourceLanguageCode &&
                updateVocabData.targetLanguageCode &&
                updateVocabData.sourceLanguageCode === updateVocabData.targetLanguageCode
            ) {
                throw new Error('Source and target languages must be different');
            }

            // If updating textTargets, we need to handle the nested updates
            const textTargetsUpdate = updateVocabData.textTargets
                ? {
                      deleteMany: {}, // Remove all existing textTargets
                      create: updateVocabData.textTargets.map((target) => ({
                          textTarget: target.textTarget,
                          grammar: target.grammar,
                          explanationSource: target.explanationSource,
                          explanationTarget: target.explanationTarget,
                          ...(target.subjectIds && {
                              textTargetSubjects: {
                                  create: target.subjectIds.map((subjectId: string) => ({
                                      subjectId,
                                  })),
                              },
                          }),
                          ...(target.wordTypeId && {
                              wordType: { connect: { id: target.wordTypeId } },
                          }),
                          ...(target.vocabExamples && {
                              vocabExamples: {
                                  create: target.vocabExamples.map((example) => ({
                                      source: example.source,
                                      target: example.target,
                                  })),
                              },
                          }),
                      })),
                  }
                : undefined;

            const vocab = await this.prismaService.vocab.update({
                where: { id },
                data: {
                    ...(updateVocabData.textSource && { textSource: updateVocabData.textSource }),
                    ...(updateVocabData.sourceLanguageCode && {
                        sourceLanguageCode: updateVocabData.sourceLanguageCode,
                    }),
                    ...(updateVocabData.targetLanguageCode && {
                        targetLanguageCode: updateVocabData.targetLanguageCode,
                    }),
                    ...(textTargetsUpdate && { textTargets: textTargetsUpdate }),
                },
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

            const vocabDto = new VocabDto({
                ...vocab,
            });

            // Update the cache
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.VOCAB,
                `id:${vocabDto.id}`,
                vocabDto,
            );

            return vocabDto;
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.vocabErrorMapping);
        }
    }

    /**
     * Delete a vocabulary record
     * @param id - The vocabulary ID to delete
     * @returns Promise<VocabDto> The deleted vocabulary DTO
     * @throws NotFoundException when vocabulary is not found
     * @throws PrismaError when database operation fails or vocabulary not found
     */
    public async delete(id: string): Promise<VocabDto> {
        try {
            const vocab = await this.prismaService.vocab.delete({
                where: { id },
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

            const vocabDto = new VocabDto({
                ...vocab,
            });

            // Remove from cache
            await this.redisService.delWithPrefix(RedisPrefix.VOCAB, `id:${id}`);

            return vocabDto;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.vocabErrorMapping);
        }
    }

    public async deleteBulk(ids: string[]): Promise<VocabDto[]> {
        try {
            const vocabDtos = await Promise.all(ids.map(async (id) => this.delete(id)));

            if (vocabDtos.length !== ids.length) {
                throw new Error('Failed to delete all vocabularies');
            }

            await this.clearVocabCache();

            return vocabDtos;
        } catch (error: unknown) {
            await this.clearVocabCache();
            PrismaErrorHandler.handle(error, 'deleteBulk', this.vocabErrorMapping);
            throw error;
        }
    }

    /**
     * Clear vocab cache
     */
    public async clearVocabCache(): Promise<void> {
        await this.redisService.clearByPrefix(RedisPrefix.VOCAB);
    }

    /**
     * Clear specific vocab cache by ID
     */
    public async clearVocabCacheById(id: string): Promise<void> {
        await this.redisService.delWithPrefix(RedisPrefix.VOCAB, `id:${id}`);
    }

    /**
     * Update specific fields in cached vocab object
     */
    public async updateVocabCacheFields(
        id: string,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await this.redisService.updateObjectFieldsWithPrefix(RedisPrefix.VOCAB, `id:${id}`, fields);
    }
}
