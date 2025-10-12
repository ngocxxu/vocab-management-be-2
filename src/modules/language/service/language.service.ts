import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Language } from '@prisma/client';
import { IResponse, PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { LanguageDto, LanguageInput } from '../model';

@Injectable()
export class LanguageService {
    // Custom error mapping cho Language
    private readonly languageErrorMapping = {
        P2002: 'Language with this code already exists',
        P2025: {
            update: 'Language not found',
            delete: 'Language not found',
            findOne: 'Language not found',
            create: 'Language creation failed',
            find: 'Language not found',
        },
        P2003: 'Invalid language data provided',
    };

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Find all languages in the database
     * @returns Promise<LanguageDto[]> Array of language DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<IResponse<LanguageDto[]>> {
        try {
            const cached = await this.redisService.jsonGetWithPrefix<Language[]>(
                RedisPrefix.LANGUAGE,
                'all',
            );
            if (cached) {
                return {
                    items: cached.map((language) => new LanguageDto(language)),
                    statusCode: HttpStatus.OK,
                };
            }

            const languages = await this.prismaService.language.findMany({
                orderBy: {
                    name: 'asc',
                },
            });

            await this.redisService.jsonSetWithPrefix(RedisPrefix.LANGUAGE, 'all', languages);

            return {
                items: languages.map((language) => new LanguageDto(language)),
                statusCode: HttpStatus.OK,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.languageErrorMapping);
        }
    }

    /**
     * Find a single language by ID
     * @param id - The language ID to search for
     * @returns Promise<LanguageDto> The language DTO
     * @throws NotFoundException when language is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<LanguageDto> {
        try {
            const cached = await this.redisService.getObjectWithPrefix<Language>(
                RedisPrefix.LANGUAGE,
                `id:${id}`,
            );
            if (cached) {
                return new LanguageDto(cached);
            }

            const language = await this.prismaService.language.findUnique({
                where: { id },
            });

            if (!language) {
                throw new NotFoundException(`Language with ID ${id} not found`);
            }

            await this.redisService.setObjectWithPrefix(RedisPrefix.LANGUAGE, `id:${id}`, language);

            return new LanguageDto(language);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.languageErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new language record
     * @param createLanguageData - The language input data
     * @returns Promise<LanguageDto> The created language DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(createLanguageData: LanguageInput): Promise<LanguageDto> {
        try {
            const { code, name }: LanguageInput = createLanguageData;

            const language = await this.prismaService.language.create({
                data: {
                    code,
                    name,
                },
            });

            // Clear cache since we added a new language
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE, 'all');

            return new LanguageDto(language);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.languageErrorMapping);
        }
    }

    /**
     * Update a language record
     * @param id - The language ID to update
     * @param updateLanguageData - Partial language input data
     * @returns Promise<LanguageDto> The updated language DTO
     * @throws NotFoundException when language is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(
        id: string,
        updateLanguageData: Partial<LanguageInput>,
    ): Promise<LanguageDto> {
        try {
            const { code, name }: Partial<LanguageInput> = updateLanguageData;

            // Check if language exists
            const existingLanguage = await this.prismaService.language.findUnique({
                where: { id },
            });

            if (!existingLanguage) {
                throw new NotFoundException(`Language with ID ${id} not found`);
            }

            // Prepare update data
            const updateData = {
                ...(code !== undefined && { code }),
                ...(name !== undefined && { name }),
            };

            const language = await this.prismaService.language.update({
                where: { id },
                data: updateData,
            });

            // Clear cache since we updated a language
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE, 'all');

            return new LanguageDto(language);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.languageErrorMapping);
        }
    }

    /**
     * Delete a language from the database
     * @param id - The language ID to delete
     * @returns Promise<LanguageDto> The deleted language DTO
     * @throws PrismaError when database operation fails or language not found
     */
    public async delete(id: string): Promise<LanguageDto> {
        try {
            const language = await this.prismaService.language.delete({
                where: { id },
            });

            // Clear cache since we deleted a language
            await this.redisService.delWithPrefix(RedisPrefix.LANGUAGE, 'all');

            return new LanguageDto(language);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.languageErrorMapping);
        }
    }
}
