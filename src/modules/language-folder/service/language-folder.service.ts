import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { LanguageFolder, Prisma } from '@prisma/client';
import { getOrderBy, getPagination, IResponse, PaginationDto, PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { RedisService } from '../../common/provider/redis.provider';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { LanguageFolderDto, LanguageFolderInput } from '../model';
import { LanguageFolderParamsInput } from '../model/language-folder-params.input';

@Injectable()
export class LanguageFolderService {
    // Custom error mapping for LanguageFolder
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
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Find all language folders for a specific user
     * @param userId - The user ID to search for
     * @returns Promise<IResponse<LanguageFolderDto[]>> Array of language folder DTOs
     * @throws PrismaError when database operation fails
     */
    public async findByUserId(userId: string): Promise<IResponse<LanguageFolderDto[]>> {
        try {
            const cached = await this.redisService.jsonGetWithPrefix<LanguageFolder[]>(
                RedisPrefix.LANGUAGE_FOLDER,
                `user:${userId}`,
            );
            if (cached) {
                return {
                    items: cached.map((folder) => new LanguageFolderDto(folder)),
                    statusCode: HttpStatus.OK,
                };
            }

            const folders = await this.prismaService.languageFolder.findMany({
                where: { userId },
                orderBy: {
                    name: 'asc',
                },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.LANGUAGE_FOLDER,
                `user:${userId}`,
                folders,
            );

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

            const where = buildPrismaWhere<
                LanguageFolderParamsInput,
                Prisma.LanguageFolderWhereInput
            >(query, {
                stringFields: ['name', 'sourceLanguageCode', 'targetLanguageCode'],
                customMap: (input, w) => {
                    // Add user filter if userId provided
                    if (userId) {
                        (w as Prisma.LanguageFolderWhereInput).userId = userId;
                    }
                },
            });

            const [totalItems, folders] = await Promise.all([
                this.prismaService.languageFolder.count({ where }),
                this.prismaService.languageFolder.findMany({
                    where,
                    include: {
                        sourceLanguage: true,
                        targetLanguage: true,
                    },
                    orderBy,
                    skip,
                    take,
                }),
            ]);

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
            const cached = await this.redisService.jsonGetWithPrefix<LanguageFolder>(
                RedisPrefix.LANGUAGE_FOLDER,
                `id:${id}`,
            );
            if (cached) {
                // Verify ownership if userId provided
                if (userId && cached.userId !== userId) {
                    throw new NotFoundException(`Language folder with ID ${id} not found`);
                }
                return new LanguageFolderDto(cached);
            }

            const where: Prisma.LanguageFolderWhereUniqueInput & Prisma.LanguageFolderWhereInput = {
                id,
            };
            if (userId) {
                where.userId = userId;
            }

            const folder = await this.prismaService.languageFolder.findFirst({
                where,
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            if (!folder) {
                throw new NotFoundException(`Language folder with ID ${id} not found`);
            }

            try {
                await this.redisService.jsonSetWithPrefix(
                    RedisPrefix.LANGUAGE_FOLDER,
                    `id:${id}`,
                    folder,
                );
            } catch (error) {
                // If Redis type conflict, clear the specific key and retry
                if (error instanceof Error && error.message.includes('wrong Redis type')) {
                    await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
                    await this.redisService.jsonSetWithPrefix(
                        RedisPrefix.LANGUAGE_FOLDER,
                        `id:${id}`,
                        folder,
                    );
                } else {
                    throw error;
                }
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
    ): Promise<LanguageFolderDto> {
        try {
            const {
                name,
                folderColor,
                sourceLanguageCode,
                targetLanguageCode,
            }: LanguageFolderInput = createFolderData;

            const folder = await this.prismaService.languageFolder.create({
                data: {
                    name,
                    folderColor,
                    sourceLanguageCode,
                    targetLanguageCode,
                    userId,
                },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            const folderDto = new LanguageFolderDto(folder);

            // Cache the new folder as RedisJSON
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.LANGUAGE_FOLDER,
                `id:${folderDto.id}`,
                folderDto,
            );

            // Clear cache for this user
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `user:${userId}`);

            return folderDto;
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
            // First, verify the folder exists and belongs to the user
            const existingFolder = await this.prismaService.languageFolder.findFirst({
                where: {
                    id,
                    userId,
                },
            });

            if (!existingFolder) {
                throw new Error('Language folder not found or unauthorized');
            }

            const {
                name,
                folderColor,
                sourceLanguageCode,
                targetLanguageCode,
            }: Partial<LanguageFolderInput> = updateFolderData;

            const folder = await this.prismaService.languageFolder.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(folderColor !== undefined && { folderColor }),
                    ...(sourceLanguageCode !== undefined && { sourceLanguageCode }),
                    ...(targetLanguageCode !== undefined && { targetLanguageCode }),
                },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            const folderDto = new LanguageFolderDto(folder);

            // Update the cache
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.LANGUAGE_FOLDER,
                `id:${folderDto.id}`,
                folderDto,
            );

            // Clear user cache
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `user:${userId}`);

            return folderDto;
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
            const where: Prisma.LanguageFolderWhereUniqueInput & Prisma.LanguageFolderWhereInput = {
                id,
            };
            if (userId) {
                where.userId = userId;
            }

            const folder = await this.prismaService.languageFolder.delete({
                where,
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            const folderDto = new LanguageFolderDto(folder);

            // Remove from cache
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
            if (userId) {
                await this.redisService.delWithPrefix(
                    RedisPrefix.LANGUAGE_FOLDER,
                    `user:${userId}`,
                );
            }

            return folderDto;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.languageFolderErrorMapping);
        }
    }

    /**
     * Clear language folder cache
     */
    public async clearLanguageFolderCache(): Promise<void> {
        await this.redisService.clearByPrefix(RedisPrefix.LANGUAGE_FOLDER);
    }

    /**
     * Clear specific language folder cache by ID
     */
    public async clearLanguageFolderCacheById(id: string): Promise<void> {
        await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
    }

    /**
     * Update specific fields in cached language folder object
     */
    public async updateLanguageFolderCacheFields(
        id: string,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await this.redisService.updateObjectFieldsWithPrefix(
            RedisPrefix.LANGUAGE_FOLDER,
            `id:${id}`,
            fields,
        );
    }
}
