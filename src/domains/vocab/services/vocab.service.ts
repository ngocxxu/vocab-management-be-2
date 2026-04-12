import { SubjectRepository } from '@/domains/catalog/subject/repositories/subject.repository';
import type { VocabTranslationJobData } from '@/queues/interfaces/job-payloads';
import { VocabTranslationProducer } from '@/queues/producers/vocab-translation.producer';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { LoggerService } from '@/shared/services/logger.service';
import { getOrderBy, getPagination } from '@/shared/utils/pagination.util';
import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { LanguageFolderNotFoundException } from '../../catalog/language-folder/exceptions';
import { PlanQuotaService } from '../../catalog/plan/services/plan-quota.service';
import { BulkDeleteInput, CsvImportErrorDto, CsvImportQueryDto, CsvImportResponseDto, CsvRowDto, VocabConflictBySubjectQuery, VocabDto, VocabInput } from '../dto';
import { BulkUpdateInput } from '../dto/bulk-update.input';
import { VocabQueryParamsInput } from '../dto/vocab-query-params.input';
import { VocabUpdateInput } from '../dto/vocab-update.input';
import { VocabBadRequestException, VocabNotFoundException } from '../exceptions';
import { VocabMapper } from '../mappers';
import { CsvImportExistingVocab, VocabRepository } from '../repositories';
import { assertCsvRowData, CsvParserUtil, CsvRowData } from '../utils/csv-parser.util';

@Injectable()
export class VocabService {
    private readonly vocabMapper = new VocabMapper();

    public constructor(
        private readonly vocabRepository: VocabRepository,
        private readonly subjectRepository: SubjectRepository,
        private readonly logger: LoggerService,
        private readonly planQuotaService: PlanQuotaService,
        private readonly vocabTranslationProducer: VocabTranslationProducer,
    ) {}

    /**
     * Find all vocabularies in the database (paginated)
     * @returns Promise<PaginationDto<VocabDto>> Paginated vocabulary DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(query: VocabQueryParamsInput, userId: string): Promise<PaginationDto<VocabDto>> {
        const { page, pageSize, skip, take } = getPagination({
            page: query.page,
            pageSize: query.pageSize,
            defaultPage: PaginationDto.DEFAULT_PAGE,
            defaultPageSize: PaginationDto.DEFAULT_PAGE_SIZE,
        });

        const orderBy = getOrderBy(query.sortBy, query.sortOrder, 'createdAt') as Prisma.VocabOrderByWithRelationInput;

        const { totalItems, vocabs } = await this.vocabRepository.findWithPagination(query, userId, skip, take, orderBy);

        if (!vocabs || !Array.isArray(vocabs)) {
            throw new VocabBadRequestException('Invalid vocabs data returned from repository');
        }

        const items = this.vocabMapper.toResponseList(vocabs);

        return this.vocabMapper.toPaginated(items, totalItems, page, pageSize);
    }

    /**
     * Find random vocabularies
     * @param count - The number of vocabularies to find
     * @param userId - Optional user ID to filter by
     * @param languageFolderId - Optional language folder ID to filter by
     * @returns Promise<VocabDto[]> The random vocabularies DTOs
     */
    public async findRandom(count: number, userId: string, languageFolderId?: string): Promise<VocabDto[]> {
        if (languageFolderId) {
            const folder = await this.vocabRepository.findLanguageFolderById(languageFolderId, userId);
            if (!folder) {
                throw new LanguageFolderNotFoundException(languageFolderId);
            }
        }

        const vocabs = await this.vocabRepository.findRandom(count, userId, languageFolderId);

        return this.vocabMapper.toResponseList(vocabs);
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
        const vocab = await this.vocabRepository.findById(id, userId);

        if (!vocab) {
            throw new VocabNotFoundException(id);
        }

        return this.vocabMapper.toResponse(vocab);
    }

    /**
     * Create a new vocabulary record with text targets and vocabExamples
     * @param createVocabData - The vocabulary input data
     * @returns Promise<VocabDto> The created vocabulary DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(createVocabData: VocabInput, userId: string, role?: UserRole): Promise<VocabDto> {
        if (role !== undefined) {
            await this.planQuotaService.assertCreationQuota(userId, role, 'vocab');
        }

        // Validate subject ownership
        if (createVocabData.textTargets?.length > 0) {
            const subjectIds = new Set<string>();

            createVocabData.textTargets.forEach((target) => {
                target.subjectIds?.forEach((id) => subjectIds.add(id));
            });

            if (subjectIds.size > 0) {
                // Inject SubjectRepository into VocabService constructor
                const validSubjects = await this.subjectRepository.findByIds(Array.from(subjectIds), userId);

                if (validSubjects.length !== subjectIds.size) {
                    throw new VocabBadRequestException('One or more subjects do not belong to you');
                }
            }
        }

        const { sourceLanguageCode, targetLanguageCode }: VocabInput = createVocabData;

        if (sourceLanguageCode === targetLanguageCode) {
            throw new VocabBadRequestException('Source and target languages must be different');
        }

        const { prismaCreate, shouldQueueTranslation, queuePayload } = this.vocabMapper.prepareCreate(createVocabData, userId);

        const vocab = await this.vocabRepository.create(prismaCreate);

        if (shouldQueueTranslation && queuePayload) {
            await this.vocabTranslationProducer.translateVocab({
                vocabId: vocab.id,
                ...queuePayload,
            } as VocabTranslationJobData);
        }

        await this.vocabRepository.clearListCaches();

        return this.vocabMapper.toResponse(vocab);
    }

    public async createBulk(createVocabData: VocabInput[], userId: string): Promise<VocabDto[]> {
        const vocabDtos = await Promise.all(createVocabData.map(async (data) => this.create(data, userId)));

        if (vocabDtos.length !== createVocabData.length) {
            throw new VocabBadRequestException('Failed to create all vocabularies');
        }

        await this.clearVocabCache();
        await this.clearVocabListCaches();

        return vocabDtos;
    }

    public async updateBulk(input: BulkUpdateInput, userId: string): Promise<VocabDto[]> {
        const { updates } = input;

        if (!updates.length) {
            throw new VocabBadRequestException('Updates are required');
        }

        const vocabDtos = await Promise.all(updates.map(async (update) => this.update(update.id, update.data, userId)));

        if (vocabDtos.length !== updates.length) {
            throw new VocabBadRequestException('Failed to update all vocabularies');
        }

        await this.clearVocabCache();
        await this.clearVocabListCaches();

        return vocabDtos;
    }

    public async findConflictsBySubject(query: VocabConflictBySubjectQuery, userId: string): Promise<PaginationDto<VocabDto>> {
        const { subjectId, page: queryPage, pageSize: queryPageSize, sortBy, sortOrder } = query;

        // Get pagination params
        const { page, pageSize, skip, take } = getPagination({
            page: queryPage,
            pageSize: queryPageSize,
            defaultPage: PaginationDto.DEFAULT_PAGE,
            defaultPageSize: PaginationDto.DEFAULT_PAGE_SIZE,
        });

        // Get order by
        const orderBy = getOrderBy(sortBy, sortOrder, 'createdAt') as Prisma.VocabOrderByWithRelationInput;

        // Count total vocabs using this subject
        const totalItems = await this.vocabRepository.countVocabsBySubjectId(subjectId, userId);

        if (totalItems === 0) {
            return this.vocabMapper.toPaginated([], 0, page, pageSize);
        }

        // Get paginated vocabs
        const vocabs = await this.vocabRepository.findVocabsBySubjectId(subjectId, userId, skip, take, orderBy);
        const vocabDtos = vocabs.map((vocab) => this.vocabMapper.toResponse(vocab));

        return this.vocabMapper.toPaginated(vocabDtos, totalItems, page, pageSize);
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
    public async update(id: string, updateVocabData: Partial<VocabUpdateInput>, userId: string): Promise<VocabDto> {
        await this.findOne(id, userId);

        if (updateVocabData.sourceLanguageCode && updateVocabData.targetLanguageCode && updateVocabData.sourceLanguageCode === updateVocabData.targetLanguageCode) {
            throw new VocabBadRequestException('Source and target languages must be different');
        }

        const vocab = await this.vocabRepository.update(id, this.vocabMapper.buildUpdateInput(updateVocabData));

        await this.vocabRepository.clearListCaches();

        return this.vocabMapper.toResponse(vocab);
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
        await this.findOne(id, userId);
        const vocab = await this.vocabRepository.delete(id, userId);

        await this.vocabRepository.clearListCaches();

        return this.vocabMapper.toResponse(vocab);
    }

    public async deleteBulk(input: BulkDeleteInput, userId?: string): Promise<VocabDto[]> {
        const { ids } = input;

        if (!ids.length) {
            throw new VocabBadRequestException('Ids are required');
        }

        const vocabDtos = await Promise.all(ids.map(async (id) => this.delete(id, userId)));

        if (vocabDtos.length !== ids.length) {
            throw new VocabBadRequestException('Failed to delete all vocabularies');
        }

        await this.clearVocabCache();
        await this.clearVocabListCaches();

        return vocabDtos;
    }

    /**
     * Clear vocab cache
     */
    public async clearVocabCache(): Promise<void> {
        await this.vocabRepository.clearCache();
    }

    public async clearVocabCacheById(id: string): Promise<void> {
        await this.vocabRepository.clearCacheById(id);
    }

    public async clearVocabListCaches(): Promise<void> {
        await this.vocabRepository.clearListCaches();
    }

    public async updateVocabCacheFields(id: string, fields: Record<string, unknown>): Promise<void> {
        await this.vocabRepository.updateCacheFields(id, fields);
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
    public async importFromCsv(rows: CsvRowData[], queryParams: CsvImportQueryDto, userId: string): Promise<CsvImportResponseDto> {
        const { languageFolderId, sourceLanguageCode, targetLanguageCode }: CsvImportQueryDto = queryParams;
        const errors: CsvImportErrorDto[] = [];
        let created = 0;
        let updated = 0;

        if (sourceLanguageCode === targetLanguageCode) {
            throw new VocabBadRequestException('Source and target languages must be different');
        }

        const languageFolder = await this.vocabRepository.findLanguageFolderById(languageFolderId, userId);
        if (!languageFolder) {
            throw new LanguageFolderNotFoundException(languageFolderId);
        }

        // Pre-validate word types and subjects (collect errors instead of throwing)
        const wordTypesInCsv = new Set<string>();
        const subjectsInCsv = new Set<string>();

        rows.forEach((row: CsvRowData) => {
            const typedRow = assertCsvRowData(row);
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
            const wordTypes = await this.vocabRepository.findWordTypesByNames(Array.from(wordTypesInCsv));

            // Create map: wordTypeName (lowercase) -> wordTypeId
            const foundWordTypeNames = new Set<string>();
            wordTypes.forEach((wt) => {
                const nameKey = wt.name.toLowerCase();
                wordTypeMap.set(nameKey, wt.id);
                foundWordTypeNames.add(nameKey);
                // Also handle partial matches
                Array.from(wordTypesInCsv).forEach((csvName) => {
                    const csvNameKey = csvName.toLowerCase();
                    if (wt.name.toLowerCase().includes(csvNameKey) && !wordTypeMap.has(csvNameKey)) {
                        wordTypeMap.set(csvNameKey, wt.id);
                        foundWordTypeNames.add(csvNameKey);
                    }
                });
            });

            // Check for missing word types
            for (const wordTypeName of wordTypesInCsv) {
                const nameKey = wordTypeName.toLowerCase();
                if (!foundWordTypeNames.has(nameKey) && !wordTypeMap.has(nameKey)) {
                    wordTypeErrors.push(`Word type '${wordTypeName}' not found. Please create it first.`);
                }
            }
        }

        // OPTIMIZATION: Load all subjects at once
        const subjectErrors: string[] = [];
        const subjectMap = new Map<string, string>();

        if (subjectsInCsv.size > 0) {
            const subjects = await this.vocabRepository.findSubjectsByNames(Array.from(subjectsInCsv), userId);

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
                    subjectErrors.push(`Subject '${subjectName}' not found. Please create it first.`);
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
            const typedRow = assertCsvRowData(row);
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
        const existingVocabs = await this.vocabRepository.findExistingVocabsForCsvImport({
            userId,
            sourceLanguageCode,
            targetLanguageCode,
            languageFolderId,
            textSources: textSourcesArray,
        });

        const existingVocabMap = new Map<string, CsvImportExistingVocab>();
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
                    const outcome = await this.vocabRepository
                        .executeCsvImportGroupTransaction(
                            {
                                textSource,
                                textTargetRows,
                                userId,
                                sourceLanguageCode,
                                targetLanguageCode,
                                languageFolderId,
                                wordTypeMap,
                                subjectMap,
                                existingVocabMap,
                            },
                            { maxWait: 10000, timeout: 30000 },
                        )
                        .then((r) => ({ ok: true as const, ...r }))
                        .catch((txError: unknown) => ({ ok: false as const, error: txError }));

                    if (outcome.ok) {
                        created += outcome.created;
                        updated += outcome.updated;
                        return;
                    }

                    const { error } = outcome;
                    if (error instanceof Error && error.message.includes('P2002')) {
                        const firstRow = textTargetRows.length > 0 ? textTargetRows[0] : undefined;
                        if (firstRow) {
                            errors.push({
                                row:
                                    rows.findIndex((r: CsvRowData) => {
                                        const typedR = assertCsvRowData(r);
                                        return typedR.textSource.toLowerCase() === textSource;
                                    }) + 1,
                                error: `Vocabulary '${textSource}' already exists with the same language combination`,
                                data: firstRow as CsvRowDto,
                            });
                        }
                        return;
                    }

                    const errorMessage = this.getErrorMessage(error);
                    const errorRow = textTargetRows.length > 0 ? textTargetRows[0] : undefined;
                    if (errorRow) {
                        this.logger.error(
                            `CSV Import Error Details: ${JSON.stringify({
                                textSource,
                                error: errorMessage,
                                firstRow: errorRow,
                                userId,
                                languageFolderId,
                                sourceLanguageCode,
                                targetLanguageCode,
                            })}`,
                        );

                        errors.push({
                            row:
                                rows.findIndex((r: CsvRowData) => {
                                    const typedR = assertCsvRowData(r);
                                    return typedR.textSource.toLowerCase() === textSource;
                                }) + 1,
                            error: errorMessage,
                            data: errorRow as CsvRowDto,
                        });
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
        const queryWithHighLimit = { ...query, pageSize: 10000 };
        const paginatedResult = await this.find(queryWithHighLimit, userId);
        const vocabs = paginatedResult.items;

        return CsvParserUtil.generateCsvBuffer(vocabs);
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
