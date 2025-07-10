import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { VocabDto, VocabInput } from '../model';

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
        },
        P2003: 'Invalid language ID, word type ID, or subject ID provided',
    };

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all vocabularies in the database
     * @returns Promise<VocabDto[]> Array of vocabulary DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<VocabDto[]> {
        try {
            const vocabs = await this.prismaService.vocab.findMany({
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                    textTargets: {
                        include: {
                            wordType: true,
                            examples: true,
                            subjectAssignments: {
                                include: {
                                    subject: true,
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            return vocabs.map((vocab) => new VocabDto({ ...vocab }));
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
            const vocab = await this.prismaService.vocab.findUnique({
                where: { id },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                    textTargets: {
                        include: {
                            wordType: true,
                            examples: true,
                            subjectAssignments: {
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

            return new VocabDto({
                ...vocab,
            });
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.vocabErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new vocabulary record with text targets and examples
     * @param createVocabData - The vocabulary input data
     * @returns Promise<VocabDto> The created vocabulary DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(createVocabData: VocabInput): Promise<VocabDto> {
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
                            examples: target.examples
                                ? {
                                      create: target.examples.map((example) => ({
                                          source: example.source,
                                          target: example.target,
                                      })),
                                  }
                                : undefined,
                            subjectAssignments: target.subjectIds
                                ? {
                                      create: target.subjectIds.map((subjectId: string) => ({
                                          subjectId,
                                      })),
                                  }
                                : undefined,
                        })),
                    },
                },
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                    textTargets: {
                        include: {
                            wordType: true,
                            examples: true,
                            subjectAssignments: {
                                include: {
                                    subject: true,
                                },
                            },
                        },
                    },
                },
            });

            return new VocabDto({
                ...vocab,
            });
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.vocabErrorMapping);
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

            // Prepare update data
            const updateData = {
                ...(textSource !== undefined && { textSource }),
                ...(sourceLanguageCode !== undefined && { sourceLanguageCode }),
                ...(targetLanguageCode !== undefined && { targetLanguageCode }),
            };

            const vocab = await this.prismaService.vocab.update({
                where: { id },
                data: updateData,
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                    textTargets: {
                        include: {
                            wordType: true,
                            examples: true,
                            subjectAssignments: {
                                include: {
                                    subject: true,
                                },
                            },
                        },
                    },
                },
            });

            return new VocabDto({
                ...vocab,
            });
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.vocabErrorMapping);
        }
    }

    /**
     * Delete a vocabulary from the database
     * @param id - The vocabulary ID to delete
     * @returns Promise<VocabDto> The deleted vocabulary DTO
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
                            examples: true,
                            subjectAssignments: {
                                include: {
                                    subject: true,
                                },
                            },
                        },
                    },
                },
            });

            return new VocabDto({
                ...vocab,
            });
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.vocabErrorMapping);
        }
    }
}
