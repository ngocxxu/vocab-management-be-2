import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { WordTypeDto, WordTypeInput } from '../model';

@Injectable()
export class WordTypeService {
    // Custom error mapping cho WordType
    private readonly wordTypeErrorMapping = {
        P2002: 'Word type with this name already exists',
        P2025: {
            update: 'Word type not found',
            delete: 'Word type not found',
            findOne: 'Word type not found',
            create: 'Word type creation failed',
            find: 'Word type not found',
        },
        P2003: 'Invalid word type data provided',
    };

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all word types in the database
     * @returns Promise<WordTypeDto[]> Array of word type DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<WordTypeDto[]> {
        try {
            const wordTypes = await this.prismaService.wordType.findMany({
                orderBy: {
                    name: 'asc',
                },
            });

            return wordTypes.map((wordType) => new WordTypeDto(wordType));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.wordTypeErrorMapping);
        }
    }

    /**
     * Find a single word type by ID
     * @param id - The word type ID to search for
     * @returns Promise<WordTypeDto> The word type DTO
     * @throws NotFoundException when word type is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<WordTypeDto> {
        try {
            const wordType = await this.prismaService.wordType.findUnique({
                where: { id },
            });

            if (!wordType) {
                throw new NotFoundException(`Word type with ID ${id} not found`);
            }

            return new WordTypeDto(wordType);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.wordTypeErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new word type record
     * @param createWordTypeData - The word type input data
     * @returns Promise<WordTypeDto> The created word type DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(createWordTypeData: WordTypeInput): Promise<WordTypeDto> {
        try {
            const { name, description }: WordTypeInput = createWordTypeData;

            const wordType = await this.prismaService.wordType.create({
                data: {
                    name,
                    description,
                },
            });

            return new WordTypeDto(wordType);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.wordTypeErrorMapping);
        }
    }

    /**
     * Update a word type record
     * @param id - The word type ID to update
     * @param updateWordTypeData - Partial word type input data
     * @returns Promise<WordTypeDto> The updated word type DTO
     * @throws NotFoundException when word type is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(
        id: string,
        updateWordTypeData: Partial<WordTypeInput>,
    ): Promise<WordTypeDto> {
        try {
            const { name, description }: Partial<WordTypeInput> = updateWordTypeData;

            // Check if word type exists
            const existingWordType = await this.prismaService.wordType.findUnique({
                where: { id },
            });

            if (!existingWordType) {
                throw new NotFoundException(`Word type with ID ${id} not found`);
            }

            // Prepare update data
            const updateData = {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
            };

            const wordType = await this.prismaService.wordType.update({
                where: { id },
                data: updateData,
            });

            return new WordTypeDto(wordType);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.wordTypeErrorMapping);
        }
    }

    /**
     * Delete a word type from the database
     * @param id - The word type ID to delete
     * @returns Promise<WordTypeDto> The deleted word type DTO
     * @throws PrismaError when database operation fails or word type not found
     */
    public async delete(id: string): Promise<WordTypeDto> {
        try {
            const wordType = await this.prismaService.wordType.delete({
                where: { id },
            });

            return new WordTypeDto(wordType);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.wordTypeErrorMapping);
        }
    }
}
