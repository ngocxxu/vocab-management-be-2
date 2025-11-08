import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vocab } from '@prisma/client';
import { AiService } from '../../ai/service/ai.service';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { PaginationDto } from '../../common/model/pagination.dto';
import { LoggerService } from '../../common/provider/logger.service';
import { RedisService } from '../../common/provider/redis.provider';
import { getOrderBy, getPagination } from '../../common/util/pagination.util';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { VocabDto, VocabInput } from '../model';
import { CsvImportQueryDto, CsvImportResponseDto, CsvImportErrorDto, CsvRowDto } from '../model';
import { VocabQueryParamsInput } from '../model/vocab-query-params.input';
import { CsvParserUtil, CsvRowData } from '../util/csv-parser.util';

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
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
    ) {}

    /**
     * Type guard to ensure CsvRowData properties are properly typed
     */
    private static assertCsvRowData(row: CsvRowData): CsvRowData {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const anyRow = row as any;
        return {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            textSource: String(anyRow.textSource),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            textTarget: String(anyRow.textTarget),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            wordType: anyRow.wordType ? String(anyRow.wordType) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            grammar: anyRow.grammar ? String(anyRow.grammar) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            explanationSource: anyRow.explanationSource
                ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  String(anyRow.explanationSource)
                : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            explanationTarget: anyRow.explanationTarget
                ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  String(anyRow.explanationTarget)
                : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            subjects: anyRow.subjects ? String(anyRow.subjects) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            exampleSource: anyRow.exampleSource ? String(anyRow.exampleSource) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            exampleTarget: anyRow.exampleTarget ? String(anyRow.exampleTarget) : undefined,
        };
    }

    /**
     * Find all vocabularies in the database (paginated)
     * @returns Promise<PaginationDto<VocabDto>> Paginated vocabulary DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(
        query: VocabQueryParamsInput,
        userId: string,
    ): Promise<PaginationDto<VocabDto>> {
        try {
            // Generate cache key based on query parameters
            const cacheKey = `list:${JSON.stringify({ ...query, userId })}`;

            // Try to get from cache first
            const cached = await this.redisService.jsonGetWithPrefix<PaginationDto<VocabDto>>(
                RedisPrefix.VOCAB,
                cacheKey,
            );

            if (cached) {
                return cached;
            }

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
                stringFields: [
                    'textSource',
                    'sourceLanguageCode',
                    'targetLanguageCode',
                    'userId',
                    'languageFolderId',
                ],
                customMap: (input, w) => {
                    // Add user filter if userId provided
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

            const items = vocabs.map((vocab) => new VocabDto({ ...vocab }));

            const result = new PaginationDto<VocabDto>(items, totalItems, page, pageSize);

            // Cache the result
            await this.redisService.jsonSetWithPrefix(RedisPrefix.VOCAB, cacheKey, result);

            return result;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.vocabErrorMapping);
        }
    }

    /**
     * Find random vocabularies
     * @param count - The number of vocabularies to find
     * @param userId - Optional user ID to filter by
     * @returns Promise<VocabDto[]> The random vocabularies DTOs
     */
    public async findRandom(count: number, userId?: string): Promise<VocabDto[]> {
        try {
            // Generate cache key for random vocab query
            const cacheKey = `random:${count}:${userId || 'all'}`;

            // Try to get from cache first
            const cached = await this.redisService.jsonGetWithPrefix<VocabDto[]>(
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

            const result = vocabs.map((vocab) => new VocabDto({ ...vocab }));

            // Cache the result with a shorter TTL for random queries (5 minutes)
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.VOCAB,
                cacheKey,
                result,
                300, // 5 minutes TTL
            );

            return result;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'findRandom', this.vocabErrorMapping);
            throw error;
        }
    }

    /**
     * Find a single vocabulary by ID
     * @param id - The vocabulary ID to search for
     * @param userId - Optional user ID to filter by
     * @returns Promise<VocabDto> The vocabulary DTO
     * @throws NotFoundException when vocabulary is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string, userId?: string): Promise<VocabDto> {
        try {
            const cached = await this.redisService.getObjectWithPrefix<Vocab>(
                RedisPrefix.VOCAB,
                `id:${id}`,
            );
            if (cached) {
                // Verify ownership if userId provided
                if (userId && cached.userId !== userId) {
                    throw new NotFoundException(`Vocabulary with ID ${id} not found`);
                }
                return new VocabDto(cached);
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
            const {
                textSource,
                sourceLanguageCode,
                targetLanguageCode,
                textTargets,
                languageFolderId,
            }: VocabInput = createVocabData;

            // If textTargets is not empty, check if any target is empty and generate it using AI
            if (textSource && textTargets && textTargets.length > 0) {
                const emptyTarget = textTargets.find((target) => !target.textTarget);
                if (emptyTarget) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                    const aiGeneratedTarget = await this.aiService.translateVocab(
                        textSource,
                        sourceLanguageCode,
                        targetLanguageCode,
                        emptyTarget.subjectIds || [],
                        userId,
                    );

                    Object.assign(emptyTarget, {
                        textTarget: aiGeneratedTarget.textTarget,
                        grammar: aiGeneratedTarget.grammar,
                        explanationSource: aiGeneratedTarget.explanationSource,
                        explanationTarget: aiGeneratedTarget.explanationTarget,
                        vocabExamples: aiGeneratedTarget.vocabExamples || [],
                    });
                }
            } else if (textSource && textTargets && textTargets.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                const aiGeneratedTarget = await this.aiService.translateVocab(
                    textSource,
                    sourceLanguageCode,
                    targetLanguageCode,
                    [],
                    userId,
                );
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                createVocabData.textTargets.push(aiGeneratedTarget);
            }

            // Validate that source and target languages are different
            if (sourceLanguageCode === targetLanguageCode) {
                throw new Error('Source and target languages must be different');
            }

            const vocab = await this.prismaService.vocab.create({
                data: {
                    textSource,
                    sourceLanguageCode,
                    targetLanguageCode,
                    languageFolderId,
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

            // Clear list caches since we added a new vocab
            await this.clearVocabListCaches();

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
            await this.clearVocabListCaches();

            return vocabDtos;
        } catch (error: unknown) {
            await this.clearVocabCache();
            await this.clearVocabListCaches();
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

            // Clear list caches since we updated a vocab
            await this.clearVocabListCaches();

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
     * @param userId - Optional user ID to filter by
     * @returns Promise<VocabDto> The deleted vocabulary DTO
     * @throws NotFoundException when vocabulary is not found
     * @throws PrismaError when database operation fails or vocabulary not found
     */
    public async delete(id: string, userId?: string): Promise<VocabDto> {
        try {
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

            const vocabDto = new VocabDto({
                ...vocab,
            });

            // Remove from cache
            await this.redisService.delWithPrefix(RedisPrefix.VOCAB, `id:${id}`);

            // Clear list caches since we deleted a vocab
            await this.clearVocabListCaches();

            return vocabDto;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.vocabErrorMapping);
        }
    }

    public async deleteBulk(ids: string[], userId?: string): Promise<VocabDto[]> {
        try {
            const vocabDtos = await Promise.all(ids.map(async (id) => this.delete(id, userId)));

            if (vocabDtos.length !== ids.length) {
                throw new Error('Failed to delete all vocabularies');
            }

            await this.clearVocabCache();
            await this.clearVocabListCaches();

            return vocabDtos;
        } catch (error: unknown) {
            await this.clearVocabCache();
            await this.clearVocabListCaches();
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
     * Clear vocab list caches (for find and findRandom methods)
     */
    public async clearVocabListCaches(): Promise<void> {
        const listKeys = await this.redisService.getKeysByPrefix(RedisPrefix.VOCAB);
        const filteredKeys = listKeys.filter(
            (key) => key.includes('list:') || key.includes('random:'),
        );

        if (filteredKeys.length > 0) {
            await this.redisService.getClient().del(...filteredKeys);
        }
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

    /**
     * Import vocabularies from CSV data
     * @param rows Array of CSV rows
     * @param queryParams Query parameters (languageFolderId, sourceLanguageCode, targetLanguageCode)
     * @param userId User ID
     * @returns Promise<CsvImportResponseDto> Import result summary
     */
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
    /* eslint-disable @typescript-eslint/no-unsafe-return */
    public async importFromCsv(
        rows: CsvRowData[],
        queryParams: CsvImportQueryDto,
        userId: string,
    ): Promise<CsvImportResponseDto> {
        const { languageFolderId, sourceLanguageCode, targetLanguageCode }: CsvImportQueryDto =
            queryParams;
        const errors: CsvImportErrorDto[] = [];
        let created = 0;
        let updated = 0;

        // Validate that source and target languages are different
        if (sourceLanguageCode === targetLanguageCode) {
            throw new Error('Source and target languages must be different');
        }

        // Validate language folder exists
        const languageFolder = await this.prismaService.languageFolder.findFirst({
            where: { id: languageFolderId, userId },
        });
        if (!languageFolder) {
            throw new Error(`Language folder with ID '${languageFolderId}' not found`);
        }

        // Pre-validate word types and subjects (collect errors instead of throwing)
        const wordTypesInCsv = new Set<string>();
        const subjectsInCsv = new Set<string>();

        rows.forEach((row: CsvRowData) => {
            const typedRow = VocabService.assertCsvRowData(row);
            if (typedRow.wordType) {
                wordTypesInCsv.add(typedRow.wordType);
            }
            if (typedRow.subjects) {
                const subjectNames = CsvParserUtil.parseSubjects(typedRow.subjects);
                subjectNames.forEach((name) => subjectsInCsv.add(name));
            }
        });

        // OPTIMIZATION: Load all wordTypes and subjects at once instead of querying one by one
        const wordTypeErrors: string[] = [];
        const wordTypeMap = new Map<string, string>();

        if (wordTypesInCsv.size > 0) {
            const wordTypes = await this.prismaService.wordType.findMany({
                where: {
                    OR: Array.from(wordTypesInCsv).map((name) => ({
                        name: { contains: name, mode: 'insensitive' },
                    })),
                },
            });

            // Create map: wordTypeName (lowercase) -> wordTypeId
            const foundWordTypeNames = new Set<string>();
            wordTypes.forEach((wt) => {
                const nameKey = wt.name.toLowerCase();
                wordTypeMap.set(nameKey, wt.id);
                foundWordTypeNames.add(nameKey);
                // Also handle partial matches
                Array.from(wordTypesInCsv).forEach((csvName) => {
                    const csvNameKey = csvName.toLowerCase();
                    if (
                        wt.name.toLowerCase().includes(csvNameKey) &&
                        !wordTypeMap.has(csvNameKey)
                    ) {
                        wordTypeMap.set(csvNameKey, wt.id);
                        foundWordTypeNames.add(csvNameKey);
                    }
                });
            });

            // Check for missing word types
            for (const wordTypeName of wordTypesInCsv) {
                const nameKey = wordTypeName.toLowerCase();
                if (!foundWordTypeNames.has(nameKey) && !wordTypeMap.has(nameKey)) {
                    wordTypeErrors.push(
                        `Word type '${wordTypeName}' not found. Please create it first.`,
                    );
                }
            }
        }

        // OPTIMIZATION: Load all subjects at once
        const subjectErrors: string[] = [];
        const subjectMap = new Map<string, string>();

        if (subjectsInCsv.size > 0) {
            const subjects = await this.prismaService.subject.findMany({
                where: {
                    userId,
                    OR: Array.from(subjectsInCsv).map((name) => ({
                        name: { equals: name, mode: 'insensitive' },
                    })),
                },
            });

            // Create map: subjectName (lowercase) -> subjectId
            const foundSubjectNames = new Set<string>();
            subjects.forEach((s) => {
                const nameKey = s.name.toLowerCase();
                subjectMap.set(nameKey, s.id);
                foundSubjectNames.add(nameKey);
            });

            // Check for missing subjects
            for (const subjectName of subjectsInCsv) {
                const nameKey = subjectName.toLowerCase();
                if (!foundSubjectNames.has(nameKey)) {
                    subjectErrors.push(
                        `Subject '${subjectName}' not found. Please create it first.`,
                    );
                }
            }
        }

        // If there are validation errors, add them to errors array and return early
        if (wordTypeErrors.length > 0 || subjectErrors.length > 0) {
            const validationErrors: CsvImportErrorDto[] = [];

            // Add word type errors
            wordTypeErrors.forEach((errorMsg) => {
                validationErrors.push({
                    row: 0, // 0 indicates validation error
                    error: errorMsg,
                    data: {
                        textSource: '',
                        textTarget: '',
                        wordType: '',
                    } as CsvRowDto,
                });
            });

            // Add subject errors
            subjectErrors.forEach((errorMsg) => {
                validationErrors.push({
                    row: 0, // 0 indicates validation error
                    error: errorMsg,
                    data: {
                        textSource: '',
                        textTarget: '',
                        subjects: '',
                    } as CsvRowDto,
                });
            });

            return new CsvImportResponseDto(0, 0, validationErrors, rows.length);
        }

        // Group rows by textSource
        const groupedByTextSource = new Map<string, CsvRowData[]>();
        rows.forEach((row: CsvRowData) => {
            const typedRow = VocabService.assertCsvRowData(row);
            const textSource: string = typedRow.textSource.toLowerCase();
            if (!groupedByTextSource.has(textSource)) {
                groupedByTextSource.set(textSource, []);
            }
            const existingRows: CsvRowData[] | undefined = groupedByTextSource.get(textSource);
            if (existingRows) {
                existingRows.push(typedRow);
            }
        });

        // OPTIMIZATION: Pre-load all existing vocabs at once
        // Only check duplicates within the same folder (languageFolderId)
        const textSourcesArray = Array.from(groupedByTextSource.keys());
        const existingVocabs = await this.prismaService.vocab.findMany({
            where: {
                userId,
                sourceLanguageCode,
                targetLanguageCode,
                languageFolderId, // Duplicate only within same folder
                OR: textSourcesArray.map((textSource) => ({
                    textSource: { equals: textSource, mode: 'insensitive' },
                })),
            },
            include: {
                textTargets: {
                    include: {
                        wordType: true,
                        textTargetSubjects: {
                            include: { subject: true },
                        },
                    },
                },
            },
        });

        // Map key includes languageFolderId to differentiate same textSource in different folders
        const existingVocabMap = new Map<string, (typeof existingVocabs)[0]>();
        existingVocabs.forEach((v) => {
            const mapKey = `${v.textSource.toLowerCase()}:${v.languageFolderId}`;
            existingVocabMap.set(mapKey, v);
        });

        // OPTIMIZATION: Process in batches to avoid large transactions and timeout
        const BATCH_SIZE = 20;
        const groupedArray = Array.from(groupedByTextSource.entries());

        for (let i = 0; i < groupedArray.length; i += BATCH_SIZE) {
            const batch = groupedArray.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async ([textSource, textTargetRows]) => {
                    try {
                        await this.prismaService.$transaction(
                            async (tx) => {
                                // OPTIMIZATION: Use pre-loaded existing vocab map with folder-specific key
                                // Duplicate check only applies within the same folder
                                const mapKey = `${textSource}:${languageFolderId}`;
                                const existingVocab = existingVocabMap.get(mapKey);

                                // OPTIMIZATION: Use pre-loaded maps instead of querying in transaction
                                const textTargetsData = textTargetRows.map((row: CsvRowData) => {
                                    const typedRow = VocabService.assertCsvRowData(row);

                                    // Use pre-loaded wordType map
                                    let wordTypeId: string | undefined;
                                    if (typedRow.wordType) {
                                        const nameKey = typedRow.wordType.toLowerCase();
                                        wordTypeId = wordTypeMap.get(nameKey);
                                        if (!wordTypeId) {
                                            throw new Error(
                                                `Word type '${typedRow.wordType}' not found`,
                                            );
                                        }
                                    }

                                    // Use pre-loaded subject map
                                    const subjectIds: string[] = [];
                                    if (typedRow.subjects) {
                                        const subjectNames = CsvParserUtil.parseSubjects(
                                            typedRow.subjects,
                                        );
                                        subjectNames.forEach((subjectName) => {
                                            const nameKey = subjectName.toLowerCase();
                                            const subjectId = subjectMap.get(nameKey);
                                            if (!subjectId) {
                                                throw new Error(
                                                    `Subject '${subjectName}' not found`,
                                                );
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
                                                ? [
                                                      {
                                                          source: typedRow.exampleSource,
                                                          target: typedRow.exampleTarget,
                                                      },
                                                  ]
                                                : [],
                                    };
                                });

                                if (existingVocab) {
                                    // Update existing vocab - add new text targets
                                    for (const textTargetData of textTargetsData) {
                                        // Check if text target already exists
                                        const existingTextTarget = existingVocab.textTargets.find(
                                            (tt) => tt.textTarget === textTargetData.textTarget,
                                        );

                                        if (!existingTextTarget) {
                                            // Create new text target
                                            await tx.textTarget.create({
                                                data: {
                                                    vocabId: existingVocab.id,
                                                    textTarget: textTargetData.textTarget,
                                                    grammar: textTargetData.grammar,
                                                    explanationSource:
                                                        textTargetData.explanationSource,
                                                    explanationTarget:
                                                        textTargetData.explanationTarget,
                                                    wordTypeId: textTargetData.wordTypeId,
                                                    textTargetSubjects: {
                                                        create: textTargetData.subjectIds.map(
                                                            (subjectId: string) => ({
                                                                subjectId,
                                                            }),
                                                        ),
                                                    },
                                                    vocabExamples: {
                                                        create: textTargetData.vocabExamples.map(
                                                            (example: {
                                                                source: string;
                                                                target: string;
                                                            }) => ({
                                                                source: example.source,
                                                                target: example.target,
                                                            }),
                                                        ),
                                                    },
                                                },
                                            });
                                        }
                                    }
                                    updated++;
                                } else {
                                    // Create new vocab
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
                                                    explanationSource:
                                                        textTargetData.explanationSource,
                                                    explanationTarget:
                                                        textTargetData.explanationTarget,
                                                    wordTypeId: textTargetData.wordTypeId,
                                                    textTargetSubjects: {
                                                        create: textTargetData.subjectIds.map(
                                                            (subjectId: string) => ({
                                                                subjectId,
                                                            }),
                                                        ),
                                                    },
                                                    vocabExamples: {
                                                        create: textTargetData.vocabExamples.map(
                                                            (example: {
                                                                source: string;
                                                                target: string;
                                                            }) => ({
                                                                source: example.source,
                                                                target: example.target,
                                                            }),
                                                        ),
                                                    },
                                                })),
                                            },
                                        },
                                    });
                                    created++;
                                }
                            },
                            {
                                maxWait: 10000, // 10 seconds max wait for transaction lock
                                timeout: 30000, // 30 seconds timeout for transaction
                            },
                        );
                    } catch (error: unknown) {
                        // Check if it's a duplicate error (P2002)
                        if (error instanceof Error && error.message.includes('P2002')) {
                            // Handle duplicate vocabulary error
                            const firstRow =
                                textTargetRows.length > 0 ? textTargetRows[0] : undefined;
                            if (firstRow) {
                                errors.push({
                                    row:
                                        rows.findIndex((r: CsvRowData) => {
                                            const typedR = VocabService.assertCsvRowData(r);
                                            return typedR.textSource.toLowerCase() === textSource;
                                        }) + 1,
                                    error: `Vocabulary '${textSource}' already exists with the same language combination`,
                                    data: firstRow as CsvRowDto,
                                });
                            }
                        } else {
                            // Handle other errors
                            const errorMessage = this.getErrorMessage(error);
                            const firstRow =
                                textTargetRows.length > 0 ? textTargetRows[0] : undefined;
                            if (firstRow) {
                                // Log detailed error for debugging
                                this.logger.error(
                                    `CSV Import Error Details: ${JSON.stringify({
                                        textSource,
                                        error: errorMessage,
                                        firstRow,
                                        userId,
                                        languageFolderId,
                                        sourceLanguageCode,
                                        targetLanguageCode,
                                    })}`,
                                );

                                errors.push({
                                    row:
                                        rows.findIndex((r: CsvRowData) => {
                                            const typedR = VocabService.assertCsvRowData(r);
                                            return typedR.textSource.toLowerCase() === textSource;
                                        }) + 1,
                                    error: errorMessage,
                                    data: firstRow as CsvRowDto,
                                });
                            }
                        }
                    }
                }),
            );
        }

        // Clear cache after import
        await this.clearVocabCache();
        await this.clearVocabListCaches();

        return new CsvImportResponseDto(created, updated, errors, rows.length);
    }

    /**
     * Export vocabularies to CSV buffer
     * @param query Query parameters for filtering
     * @param userId User ID
     * @returns Promise<Buffer> CSV file buffer
     */
    public async exportToCsv(query: VocabQueryParamsInput, userId: string): Promise<Buffer> {
        try {
            const queryWithHighLimit = { ...query, pageSize: 10000 };
            const paginatedResult = await this.find(queryWithHighLimit, userId);
            const vocabs = paginatedResult.items;

            return CsvParserUtil.generateCsvBuffer(vocabs);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'exportToCsv', this.vocabErrorMapping);
        }
    }

    /**
     * Helper method to safely extract error message
     */
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return 'Unknown error';
    }
}
