import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { IResponse } from '@/shared';
import { PrismaErrorHandler } from '@/shared/handlers/error.handler';
import { LanguageMapper } from '../mappers';
import { LanguageDto, LanguageInput } from '../dto';
import { LanguageRepository } from '../repositories';

@Injectable()
export class LanguageService {
    private readonly languageMapper = new LanguageMapper();
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

    public constructor(private readonly languageRepository: LanguageRepository) {}

    /**
     * Find all languages in the database
     * @returns Promise<LanguageDto[]> Array of language DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<IResponse<LanguageDto[]>> {
        try {
            const languages = await this.languageRepository.findAll();

            return {
                items: this.languageMapper.toResponseList(languages),
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
            const language = await this.languageRepository.findById(id);

            if (!language) {
                throw new NotFoundException(`Language with ID ${id} not found`);
            }

            return this.languageMapper.toResponse(language);
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
            const language = await this.languageRepository.create(
                this.languageMapper.toCreateInput(createLanguageData),
            );

            return this.languageMapper.toResponse(language);
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
            const existingLanguage = await this.languageRepository.findById(id);

            if (!existingLanguage) {
                throw new NotFoundException(`Language with ID ${id} not found`);
            }

            const language = await this.languageRepository.update(
                id,
                this.languageMapper.buildUpdateInput(updateLanguageData),
            );

            return this.languageMapper.toResponse(language);
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
            const language = await this.languageRepository.delete(id);

            return this.languageMapper.toResponse(language);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.languageErrorMapping);
        }
    }
}
