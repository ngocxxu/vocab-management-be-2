import { Injectable, NotFoundException } from '@nestjs/common';
import {
    NotificationAction,
    NotificationType,
    PriorityLevel,
    Prisma,
    QuestionType,
    TrainerStatus,
    User,
    VocabTrainer,
} from '@prisma/client';
import { AiService, MultipleChoiceQuestion } from '../../ai/service/ai.service';
import { PrismaErrorHandler } from '../../common/handler';
import { PaginationDto } from '../../common/model';
import { PrismaService } from '../../common/provider';
import { buildPrismaWhere, getOrderBy, getPagination } from '../../common/util';
import { ReminderService } from '../../reminder/service';
import { EEmailTemplate, EReminderTitle, EXPIRES_AT_30_DAYS } from '../../reminder/util';
import {
    SubmitMultipleChoiceInput,
    UpdateVocabTrainerInput,
    VocabTrainerDto,
    VocabTrainerInput,
    VocabTrainerQueryParamsInput,
    MultipleChoiceQuestionDto,
} from '../model';
import {
    EReminderRepeat,
    evaluateMultipleChoiceAnswers,
    VocabTrainerWithTypedAnswers,
    VocabWithTextTargets,
} from '../util';

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
            submitExam: 'Exam of vocab trainer not found',
        },
    };

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly reminderService: ReminderService,
        private readonly aiService: AiService,
    ) {}

    /**
     * Find all vocab trainers in the database (paginated)
     */
    public async find(
        query: VocabTrainerQueryParamsInput,
        userId?: string,
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
                stringFields: ['name', 'userId'],
                enumFields: ['questionType'],
                customMap: (input, w) => {
                    // Add user filter if userId provided
                    if (userId) {
                        (w as Prisma.VocabTrainerWhereInput).userId = userId;
                    }
                    // Handle status array filtering
                    if (input.status && Array.isArray(input.status) && input.status.length > 0) {
                        (w as Prisma.VocabTrainerWhereInput).status = {
                            in: input.status,
                        };
                    }
                },
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
    public async findOne(id: string, userId?: string): Promise<VocabTrainerDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (userId) {
                where.userId = userId;
            }

            const trainer = await this.prismaService.vocabTrainer.findFirst({
                where,
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
    public async findOneAndExam(id: string, userId?: string): Promise<VocabTrainerDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (userId) {
                where.userId = userId;
            }

            const trainer = await this.prismaService.vocabTrainer.findFirst({
                where,
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

                // Generate AI-powered multiple choice questions
                const aiQuestions: MultipleChoiceQuestion[] =
                    await this.aiService.generateMultipleChoiceQuestions(dataVocabAssignments);

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                trainer.questionAnswers = JSON.parse(JSON.stringify(aiQuestions));
            }
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'findOneAndExam', this.errorMapping);
        }
    }

    public async submitMultipleChoice(
        id: string,
        input: SubmitMultipleChoiceInput,
        user: User,
    ): Promise<VocabTrainerDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (user.id) {
                where.userId = user.id;
            }

            const trainer = (await this.prismaService.vocabTrainer.findFirst({
                where,
            })) as unknown as VocabTrainerWithTypedAnswers;
            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            const { countTime, wordTestSelects } = input;

            // Use the utility function for answer evaluation
            const { createResults, correctAnswers } = evaluateMultipleChoiceAnswers(
                trainer.id,
                wordTestSelects,
                trainer.questionAnswers,
            );

            // Batch insert all results
            await this.prismaService.vocabTrainerResult.deleteMany({
                where: { vocabTrainerId: trainer.id },
            });
            await this.prismaService.vocabTrainerResult.createMany({ data: createResults });

            // Calculate overall status
            const totalQuestions = wordTestSelects.length;
            const scorePercentage = (correctAnswers / totalQuestions) * 100;
            const overallStatus =
                scorePercentage >= 70 ? TrainerStatus.PASSED : TrainerStatus.FAILED;

            if (overallStatus === TrainerStatus.PASSED) {
                const reminderRepeatNext = trainer.reminderRepeat * 2;
                const reminderDisabled = reminderRepeatNext >= Number(EReminderRepeat.MAX_REPEAT);

                await this.prismaService.vocabTrainer.update({
                    where: { id: trainer.id },
                    data: {
                        reminderRepeat: Math.min(
                            reminderRepeatNext,
                            Number(EReminderRepeat.MAX_REPEAT),
                        ),
                        reminderLastRemind: new Date(),
                        reminderDisabled,
                    },
                });

                // ----------------------Schedule reminder----------------------
                const sendDataReminder = {
                    data: {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        testName: trainer.name,
                        repeatDays: reminderRepeatNext.toString(),
                        examUrl: `${process.env.FRONTEND_URL}/${trainer.id}`,
                    },
                };

                const sendDataNotification = {
                    data: {
                        trainerName: trainer.name,
                        scorePercentage,
                    },
                };

                if (!reminderDisabled) {
                    const lastRemindDate =
                        trainer.reminderLastRemind instanceof Date
                            ? trainer.reminderLastRemind
                            : new Date(trainer.reminderLastRemind);

                    const reminderIntervalDays = trainer.reminderRepeat * 2;
                    const nextReminderTime = new Date(
                        lastRemindDate.getTime() + reminderIntervalDays * 24 * 60 * 60 * 1000,
                    );
                    const delayInMs = Math.max(
                        0,
                        nextReminderTime.getTime() - new Date().getTime(),
                    );

                    await this.reminderService.scheduleReminder(
                        user.email,
                        EReminderTitle.VOCAB_TRAINER,
                        EEmailTemplate.EXAM_REMINDER,
                        sendDataReminder.data,
                        delayInMs,
                    );

                    await this.reminderService.scheduleCreateNotification(
                        [user.id],
                        EReminderTitle.VOCAB_TRAINER,
                        sendDataNotification.data,
                        delayInMs,
                    );
                }
            }

            // ----------------------Create notification----------------------
            await this.prismaService.notification.create({
                data: {
                    type: NotificationType.VOCAB_TRAINER,
                    action: NotificationAction.CREATE,
                    priority: scorePercentage >= 70 ? PriorityLevel.LOW : PriorityLevel.MEDIUM,
                    data: {
                        trainerName: trainer.name,
                        scorePercentage,
                    },
                    expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                    isActive: true,
                    notificationRecipients: {
                        create: {
                            userId: user.id,
                        },
                    },
                },
            });

            // Update trainer status if needed
            const result = await this.prismaService.vocabTrainer.update({
                where: { id: trainer.id },
                data: {
                    name: trainer.name,
                    status: overallStatus,
                    countTime,
                    setCountTime: trainer.setCountTime,
                    updatedAt: new Date(),
                },
                include: {
                    results: true,
                },
            });

            return new VocabTrainerDto(
                result as unknown as VocabTrainer & {
                    questionAnswers?: MultipleChoiceQuestionDto[];
                },
            );
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'submitExam', this.errorMapping);
        }
    }

    /**
     * Create a new vocab trainer
     */
    public async create(input: VocabTrainerInput, userId: string): Promise<VocabTrainerDto> {
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
                    userId,
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

            return new VocabTrainerDto(
                trainerWithAssignments as unknown as VocabTrainer & {
                    questionAnswers?: MultipleChoiceQuestionDto[];
                },
            );
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.errorMapping);
        }
    }

    /**
     * Update a vocab trainer
     */
    public async update(
        id: string,
        input: UpdateVocabTrainerInput,
        userId?: string,
    ): Promise<VocabTrainerDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (userId) {
                where.userId = userId;
            }

            const existing = await this.prismaService.vocabTrainer.findFirst({ where });
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
    public async delete(id: string, userId?: string): Promise<VocabTrainerDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (userId) {
                where.userId = userId;
            }

            const trainer = await this.prismaService.vocabTrainer.delete({
                where,
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

    public async deleteBulk(ids: string[], userId?: string): Promise<VocabTrainerDto[]> {
        try {
            const trainerDtos = await Promise.all(ids.map(async (id) => this.delete(id, userId)));

            if (trainerDtos.length !== ids.length) {
                throw new Error('Failed to delete all vocab trainers');
            }

            return trainerDtos;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'deleteBulk', this.errorMapping);
            throw error;
        }
    }
}
