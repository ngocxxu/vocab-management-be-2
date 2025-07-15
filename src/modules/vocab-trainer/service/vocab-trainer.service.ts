import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionType, TrainerStatus } from '@prisma/client';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { PaginationDto } from '../../common/model/pagination.dto';
import { PrismaService } from '../../common/provider/prisma.provider';
import { getOrderBy, getPagination } from '../../common/util/pagination.util';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { UpdateVocabTrainerInput } from '../model/update-vocab-trainer.input';
import { VocabTrainerQueryParamsInput } from '../model/vocab-trainer-query-params.input';
import { VocabTrainerDto } from '../model/vocab-trainer.dto';
import { VocabTrainerInput } from '../model/vocab-trainer.input';
import { createQuestion, getRandomElements } from '../util';
import { VocabWithTextTargets } from '../util/type';

@Injectable()
export class VocabTrainerService {
    private readonly errorMapping = {
        P2002: 'VocabTrainer with this name already exists',
        P2025: {
            update: 'VocabTrainer not found',
            delete: 'VocabTrainer not found',
            findOne: 'VocabTrainer not found',
            create: 'Related record not found',
            find: 'VocabTrainer not found',
            findOneAndExam: 'Exam of vocab trainer not found',
        },
    };

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all vocab trainers in the database (paginated)
     */
    public async find(
        query: VocabTrainerQueryParamsInput,
    ): Promise<PaginationDto<VocabTrainerDto>> {
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
            ) as Prisma.VocabTrainerOrderByWithRelationInput;

            const where = buildPrismaWhere<
                VocabTrainerQueryParamsInput,
                Prisma.VocabTrainerWhereInput
            >(query, {
                stringFields: ['name'],
                enumFields: ['status', 'questionType'],
            });

            const [totalItems, trainers] = await Promise.all([
                this.prismaService.vocabTrainer.count({ where }),
                this.prismaService.vocabTrainer.findMany({
                    where,
                    include: {
                        vocabAssignments: true,
                        results: true,
                    },
                    orderBy,
                    skip,
                    take,
                }),
            ]);
            const items = trainers.map((trainer) => new VocabTrainerDto(trainer));
            return new PaginationDto<VocabTrainerDto>(items, totalItems, page, pageSize);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.errorMapping);
        }
    }

    /**
     * Find a single vocab trainer by ID
     */
    public async findOne(id: string): Promise<VocabTrainerDto> {
        try {
            const trainer = await this.prismaService.vocabTrainer.findUnique({
                where: { id },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });
            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'findOne', this.errorMapping);
        }
    }

    /**
     * Find a single vocab trainer by ID and exam
     */
    public async findOneAndExam(id: string): Promise<VocabTrainerDto> {
        try {
            const trainer = await this.prismaService.vocabTrainer.findUnique({
                where: { id },
                include: {
                    vocabAssignments: {
                        include: {
                            vocab: {
                                include: {
                                    textTargets: true,
                                },
                            },
                        },
                    },
                    results: true,
                },
            });
            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            // -----------------------------Create multiple choice questions-------------------------------
            if (trainer.questionType === QuestionType.MULTIPLE_CHOICE) {
                const dataVocabAssignments: VocabWithTextTargets[] = trainer.vocabAssignments.map(
                    (vocabAssignment) => vocabAssignment.vocab,
                );
                const listVocab = await this.prismaService.vocab.findMany({
                    include: { textTargets: true },
                });
                const questions = dataVocabAssignments.map((vocab) => {
                    const type = Math.random() < 0.5 ? 'source' : 'target';
                    const wrongVocabs = getRandomElements(listVocab, 3, vocab);
                    return createQuestion(vocab, type, wrongVocabs);
                });
                return new VocabTrainerDto({ ...trainer, questions });
            } else {
                return new VocabTrainerDto(trainer);
            }
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'findOneAndExam', this.errorMapping);
        }
    }

    /**
     * Create a new vocab trainer
     */
    public async create(input: VocabTrainerInput): Promise<VocabTrainerDto> {
        try {
            const { vocabAssignmentIds = [], ...trainerData } = input;
            const trainer = await this.prismaService.vocabTrainer.create({
                data: {
                    name: trainerData.name,
                    status: trainerData.status ?? TrainerStatus.PENDING,
                    questionType: trainerData.questionType ?? QuestionType.MULTIPLE_CHOICE,
                    reminderTime: trainerData.reminderTime ?? 0,
                    countTime: trainerData.countTime ?? 0,
                    setCountTime: trainerData.setCountTime ?? 0,
                    reminderDisabled: trainerData.reminderDisabled ?? false,
                    reminderRepeat: trainerData.reminderRepeat ?? 2,
                    reminderLastRemind: trainerData.reminderLastRemind ?? new Date(),
                },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });

            // Create vocab assignments if any
            if (vocabAssignmentIds.length > 0) {
                await Promise.all(
                    vocabAssignmentIds.map(async (vocabId) =>
                        this.prismaService.vocabTrainerWord.create({
                            data: {
                                vocabTrainerId: trainer.id,
                                vocabId,
                            },
                        }),
                    ),
                );
            }

            // Fetch the trainer again to include the new assignments
            const trainerWithAssignments = await this.prismaService.vocabTrainer.findUnique({
                where: { id: trainer.id },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });

            if (!trainerWithAssignments) {
                throw new NotFoundException(
                    `VocabTrainer with ID ${trainer.id} not found after creation`,
                );
            }

            return new VocabTrainerDto(trainerWithAssignments);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.errorMapping);
        }
    }

    /**
     * Update a vocab trainer
     */
    public async update(id: string, input: UpdateVocabTrainerInput): Promise<VocabTrainerDto> {
        try {
            const existing = await this.prismaService.vocabTrainer.findUnique({ where: { id } });
            if (!existing) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }
            const trainer = await this.prismaService.vocabTrainer.update({
                where: { id },
                data: {
                    name: input.name,
                    status: input.status,
                    questionType: input.questionType ?? existing.questionType,
                    reminderTime: input.reminderTime ?? existing.reminderTime,
                    countTime: input.countTime ?? existing.countTime,
                    setCountTime: input.setCountTime ?? existing.setCountTime,
                    reminderDisabled: input.reminderDisabled ?? existing.reminderDisabled,
                    reminderRepeat: input.reminderRepeat ?? existing.reminderRepeat,
                    reminderLastRemind: input.reminderLastRemind ?? existing.reminderLastRemind,
                },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'update', this.errorMapping);
        }
    }

    /**
     * Delete a vocab trainer
     */
    public async delete(id: string): Promise<VocabTrainerDto> {
        try {
            const trainer = await this.prismaService.vocabTrainer.delete({
                where: { id },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.errorMapping);
        }
    }
}
