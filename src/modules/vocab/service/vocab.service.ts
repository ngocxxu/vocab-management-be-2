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
                'createdAt'
            ) as Prisma.VocabOrderByWithRelationInput;

            const where = buildPrismaWhere<VocabQueryParamsInput, Prisma.VocabWhereInput>(query, {
                stringFields: ['textSource', 'sourceLanguageCode', 'targetLanguageCode', 'userId'],
                customMap: (input, w) => {
                    if (input.subjectIds && Array.isArray(input.subjectIds) && input.subjectIds.length > 0) {
                        (w as Prisma.VocabWhereInput).textTargets = {
                            some: {
                                textTargetSubjects: {
                                    some: {
                                        subjectId: { in: input.subjectIds }
                                    }
                                }
                            }
                        };
                    }
                }
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
     * Find a single vocabulary by ID
     * @param id - The vocabulary ID to search for
     * @returns Promise<VocabDto> The vocabulary DTO
     * @throws NotFoundException when vocabulary is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<VocabDto> {
        try {
            const cached = await this.redisService.getObjectWithPrefix<Vocab>(RedisPrefix.VOCAB, `id:${id}`);
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

            await this.redisService.setObjectWithPrefix(
                RedisPrefix.VOCAB,
                `id:${id}`,
                vocab
            );

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
                            wordTypeId: target.wordTypeId,
                            textTarget: target.textTarget,
                            grammar: target.grammar,
                            explanationSource: target.explanationSource,
                            explanationTarget: target.explanationTarget,
                            vocabExamples: target.vocabExamples
                                ? {
                                      create: target.vocabExamples.map((example) => ({
                                          source: example.source,
                                          target: example.target,
                                      })),
                                  }
                                : undefined,
                            textTargetSubjects: target.subjectIds
                                ? {
                                      create: target.subjectIds.map((subjectId: string) => ({
                                          subjectId,
                                      })),
                                  }
                                : undefined,
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
                vocabDto
            );

            return vocabDto;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.vocabErrorMapping);
        }
    }

    public async createBulk(createVocabData: VocabInput[], userId: string): Promise<VocabDto[]> {
        try {
            const vocabDtos = await Promise.all(createVocabData.map(async (data) => this.create(data, userId)));

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
    public async update(id: string, updateVocabData: Partial<VocabInput>): Promise<VocabDto> {
        try {
            const { textSource, sourceLanguageCode, targetLanguageCode }: Partial<VocabInput> =
                updateVocabData;

            // Check if vocabulary exists
            const existingVocab = await this.prismaService.vocab.findUnique({
                where: { id },
            });

            if (!existingVocab) {
                throw new NotFoundException(`Vocabulary with ID ${id} not found`);
            }

            // Validate that source and target languages are different if both are provided
            const finalSourceLangCode: string = sourceLanguageCode ?? existingVocab.sourceLanguageCode;
            const finalTargetLangCode: string = targetLanguageCode ?? existingVocab.targetLanguageCode;

            if (finalSourceLangCode === finalTargetLangCode) {
                throw new Error('Source and target languages must be different');
            }

            const vocab = await this.prismaService.vocab.update({
                where: { id },
                data: {
                    ...(textSource !== undefined && { textSource }),
                    ...(sourceLanguageCode !== undefined && { sourceLanguageCode }),
                    ...(targetLanguageCode !== undefined && { targetLanguageCode }),
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

            // Update cache as RedisJSON
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.VOCAB,
                `id:${id}`,
                vocabDto
            );

            return vocabDto;
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.vocabErrorMapping);
            throw error;
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
    public async updateVocabCacheFields(id: string, fields: Record<string, unknown>): Promise<void> {
        await this.redisService.updateObjectFieldsWithPrefix(
            RedisPrefix.VOCAB,
            `id:${id}`,
            fields
        );
    }
}
