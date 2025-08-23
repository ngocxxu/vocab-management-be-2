import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { LanguageFolder } from '@prisma/client';
import { IResponse, PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { LanguageFolderDto, LanguageFolderInput } from '../model';

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
     * Find all language folders in the database (admin only)
     * @returns Promise<IResponse<LanguageFolderDto[]>> Array of language folder DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<IResponse<LanguageFolderDto[]>> {
        try {
            const cached = await this.redisService.jsonGetWithPrefix<LanguageFolder[]>(
                RedisPrefix.LANGUAGE_FOLDER,
                'all',
            );
            if (cached) {
                return {
                    items: cached.map((folder) => new LanguageFolderDto(folder)),
                    statusCode: HttpStatus.OK,
                };
            }

            const folders = await this.prismaService.languageFolder.findMany({
                orderBy: [{ userId: 'asc' }, { name: 'asc' }],
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            await this.redisService.jsonSetWithPrefix(RedisPrefix.LANGUAGE_FOLDER, 'all', folders);

            return {
                items: folders.map((folder) => new LanguageFolderDto(folder)),
                statusCode: HttpStatus.OK,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.languageFolderErrorMapping);
        }
    }

    /**
     * Find a single language folder by ID
     * @param id - The language folder ID to search for
     * @returns Promise<LanguageFolderDto> The language folder DTO
     * @throws NotFoundException when language folder is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<LanguageFolderDto> {
        try {
            const cached = await this.redisService.getObjectWithPrefix<LanguageFolder>(
                RedisPrefix.LANGUAGE_FOLDER,
                `id:${id}`,
            );
            if (cached) {
                return new LanguageFolderDto(cached);
            }

            const folder = await this.prismaService.languageFolder.findUnique({
                where: { id },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            if (!folder) {
                throw new NotFoundException(`Language folder with ID ${id} not found`);
            }

            await this.redisService.setObjectWithPrefix(
                RedisPrefix.LANGUAGE_FOLDER,
                `id:${id}`,
                folder,
            );

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

            // Clear cache for this user
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `user:${userId}`);
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, 'all');

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
            const {
                name,
                folderColor,
                sourceLanguageCode,
                targetLanguageCode,
            }: Partial<LanguageFolderInput> = updateFolderData;

            // Check if folder exists and belongs to the user
            const existingFolder = await this.prismaService.languageFolder.findUnique({
                where: { id },
            });

            if (!existingFolder) {
                throw new NotFoundException(`Language folder with ID ${id} not found`);
            }

            if (existingFolder.userId !== userId) {
                throw new NotFoundException('You can only update your own language folders');
            }

            // Prepare update data
            const updateData = {
                ...(name !== undefined && { name }),
                ...(folderColor !== undefined && { folderColor }),
                ...(sourceLanguageCode !== undefined && { sourceLanguageCode }),
                ...(targetLanguageCode !== undefined && { targetLanguageCode }),
            };

            const folder = await this.prismaService.languageFolder.update({
                where: { id },
                data: updateData,
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            // Clear cache
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `user:${userId}`);
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, 'all');

            return new LanguageFolderDto(folder);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.languageFolderErrorMapping);
        }
    }

    /**
     * Delete a language folder from the database
     * @param id - The language folder ID to delete
     * @param userId - The user ID who owns this folder (for authorization)
     * @returns Promise<LanguageFolderDto> The deleted language folder DTO
     * @throws NotFoundException when language folder is not found or doesn't belong to user
     * @throws PrismaError when database operation fails
     */
    public async delete(id: string, userId: string): Promise<LanguageFolderDto> {
        try {
            // Check if folder exists and belongs to the user
            const existingFolder = await this.prismaService.languageFolder.findUnique({
                where: { id },
            });

            if (!existingFolder) {
                throw new NotFoundException(`Language folder with ID ${id} not found`);
            }

            if (existingFolder.userId !== userId) {
                throw new NotFoundException('You can only delete your own language folders');
            }

            const folder = await this.prismaService.languageFolder.delete({
                where: { id },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
            });

            // Clear cache
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, `user:${userId}`);
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE_FOLDER, 'all');

            return new LanguageFolderDto(folder);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'delete', this.languageFolderErrorMapping);
        }
    }
}

