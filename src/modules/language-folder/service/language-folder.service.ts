import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { getOrderBy, getPagination, IResponse, PaginationDto } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { PlanQuotaService } from '../../plan/service/plan-quota.service';
import { LanguageFolderDto, LanguageFolderInput } from '../model';
import { LanguageFolderParamsInput } from '../model/language-folder-params.input';
import { LanguageFolderRepository } from '../repository';

@Injectable()
export class LanguageFolderService {
    private readonly languageFolderErrorMapping = {
        P2002: 'Language folder with this name already exists for this user',
        P2025: {
            update: 'Language folder not found',
            delete: 'Language folder not found',
            findOne: 'Language folder not found',
            create: 'Language folder creation failed',
            find: 'Language folder not found',
        },
        P2003: 'Invalid language folder data provided',
    };

    public constructor(
        private readonly languageFolderRepository: LanguageFolderRepository,
        private readonly planQuotaService: PlanQuotaService,
    ) {}

    /**
     * Find all language folders for a specific user
     * @param userId - The user ID to search for
     * @returns Promise<IResponse<LanguageFolderDto[]>> Array of language folder DTOs
     * @throws PrismaError when database operation fails
     */
    public async findByUserId(userId: string): Promise<IResponse<LanguageFolderDto[]>> {
        try {
            const folders = await this.languageFolderRepository.findByUserId(userId);

            return {
                items: folders.map((folder) => new LanguageFolderDto(folder)),
                statusCode: HttpStatus.OK,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'findByUserId', this.languageFolderErrorMapping);
        }
    }

    /**
     * Find all language folders in the database (paginated)
     * @returns Promise<PaginationDto<LanguageFolderDto>> Paginated language folder DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(
        query: LanguageFolderParamsInput,
        userId: string,
    ): Promise<PaginationDto<LanguageFolderDto>> {
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
            ) as Prisma.LanguageFolderOrderByWithRelationInput;

            const { totalItems, folders } = await this.languageFolderRepository.findWithPagination(
                query,
                userId,
                skip,
                take,
                orderBy,
            );

            const items = folders.map((folder) => new LanguageFolderDto(folder));
            return new PaginationDto<LanguageFolderDto>(items, totalItems, page, pageSize);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.languageFolderErrorMapping);
        }
    }

    /**
     * Find a single language folder by ID
     * @param id - The language folder ID to search for
     * @param userId - Optional user ID to filter by
     * @returns Promise<LanguageFolderDto> The language folder DTO
     * @throws NotFoundException when language folder is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string, userId?: string): Promise<LanguageFolderDto> {
        try {
            const folder = await this.languageFolderRepository.findById(id, userId);

            if (!folder) {
                throw new NotFoundException(`Language folder with ID ${id} not found`);
            }

            return new LanguageFolderDto(folder);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.languageFolderErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new language folder record
     * @param createFolderData - The language folder input data
     * @param userId - The user ID who owns this folder
     * @returns Promise<LanguageFolderDto> The created language folder DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(
        createFolderData: LanguageFolderInput,
        userId: string,
        role?: UserRole,
    ): Promise<LanguageFolderDto> {
        try {
            if (role !== undefined) {
                await this.planQuotaService.assertCreationQuota(userId, role, 'languageFolder');
            }
            const {
                name,
                folderColor,
                sourceLanguageCode,
                targetLanguageCode,
            }: LanguageFolderInput = createFolderData;

            const folder = await this.languageFolderRepository.create({
                name,
                folderColor,
                sourceLanguageCode,
                targetLanguageCode,
                userId,
            });

            return new LanguageFolderDto(folder);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.languageFolderErrorMapping);
        }
    }

    /**
     * Update a language folder record
     * @param id - The language folder ID to update
     * @param updateFolderData - Partial language folder input data
     * @param userId - The user ID who owns this folder (for authorization)
     * @returns Promise<LanguageFolderDto> The updated language folder DTO
     * @throws NotFoundException when language folder is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(
        id: string,
        updateFolderData: Partial<LanguageFolderInput>,
        userId: string,
    ): Promise<LanguageFolderDto> {
        try {
            const existingFolder = await this.languageFolderRepository.findById(id, userId);

            if (!existingFolder) {
                throw new Error('Language folder not found or unauthorized');
            }

            const {
                name,
                folderColor,
                sourceLanguageCode,
                targetLanguageCode,
            }: Partial<LanguageFolderInput> = updateFolderData;

            const folder = await this.languageFolderRepository.update(id, {
                ...(name !== undefined && { name }),
                ...(folderColor !== undefined && { folderColor }),
                ...(sourceLanguageCode !== undefined && { sourceLanguageCode }),
                ...(targetLanguageCode !== undefined && { targetLanguageCode }),
            });

            return new LanguageFolderDto(folder);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.languageFolderErrorMapping);
        }
    }

    /**
     * Delete a language folder record
     * @param id - The language folder ID to delete
     * @param userId - Optional user ID to filter by
     * @returns Promise<LanguageFolderDto> The deleted language folder DTO
     * @throws NotFoundException when language folder is not found
     * @throws PrismaError when database operation fails or language folder not found
     */
    public async delete(id: string, userId?: string): Promise<LanguageFolderDto> {
        try {
            const folder = await this.languageFolderRepository.delete(id, userId);

            return new LanguageFolderDto(folder);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.languageFolderErrorMapping);
        }
    }

    public async clearLanguageFolderCache(): Promise<void> {
        await this.languageFolderRepository.clearCache();
    }

    public async clearLanguageFolderCacheById(id: string): Promise<void> {
        await this.languageFolderRepository.clearCacheById(id);
    }
}
