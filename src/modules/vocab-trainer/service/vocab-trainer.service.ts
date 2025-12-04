import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { NotificationService } from '../../notification/service';
import { ReminderService } from '../../reminder/service';
import { EEmailTemplate, EReminderTitle, EXPIRES_AT_30_DAYS } from '../../reminder/util';
import {
    MultipleChoiceQuestionDto,
    SubmitFillInBlankInput,
    SubmitMultipleChoiceInput,
    SubmitTranslationAudioInput,
    UpdateVocabTrainerInput,
    VocabTrainerDto,
    VocabTrainerInput,
    VocabTrainerQueryParamsInput,
} from '../model';
import { SubmitTranslationAudioResponseDto } from '../model/submit-translation-audio-response.dto';
import {
    EReminderRepeat,
    evaluateMultipleChoiceAnswers,
    VocabTrainerWithTypedAnswers,
    VocabWithTextTargets,
} from '../util';

export interface FlipCardQuestion {
    frontText: string[];
    backText: string[];
    frontLanguageCode: string;
    backLanguageCode: string;
}

@Injectable()
export class VocabTrainerService {
    private readonly logger = new Logger(VocabTrainerService.name);
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
        private readonly notificationService: NotificationService,
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
                    await this.aiService.generateMultipleChoiceQuestions(
                        dataVocabAssignments,
                        trainer.userId,
                    );

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                trainer.questionAnswers = JSON.parse(JSON.stringify(aiQuestions));
            } else if (trainer.questionType === QuestionType.FILL_IN_THE_BLANK) {
                const fillInBlankQuestions: Array<{
                    correctAnswer: string;
                    type: 'textSource' | 'textTarget';
                    content: string;
                    vocabId: string;
                }> = [];

                trainer.vocabAssignments.forEach((assignment) => {
                    const vocab = assignment.vocab;

                    if (!vocab.textTargets || vocab.textTargets.length === 0) {
                        return;
                    }

                    const isAskingSource = Math.random() < 0.5;
                    const randomTargetIndex = Math.floor(Math.random() * vocab.textTargets.length);
                    const selectedTarget = vocab.textTargets[randomTargetIndex];

                    if (isAskingSource) {
                        fillInBlankQuestions.push({
                            correctAnswer: selectedTarget.textTarget,
                            type: 'textTarget',
                            content: `What is the translation of "${vocab.textSource}" in ${vocab.targetLanguageCode}?`,
                            vocabId: vocab.id,
                        });
                    } else {
                        fillInBlankQuestions.push({
                            correctAnswer: vocab.textSource,
                            type: 'textSource',
                            content: `What is the translation of "${selectedTarget.textTarget}" in ${vocab.sourceLanguageCode}?`,
                            vocabId: vocab.id,
                        });
                    }
                });

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                trainer.questionAnswers = JSON.parse(JSON.stringify(fillInBlankQuestions));
            } else if (trainer.questionType === QuestionType.FLIP_CARD) {
                const flipCardQuestions: FlipCardQuestion[] = [];

                trainer.vocabAssignments.forEach((assignment) => {
                    const vocab = assignment.vocab;

                    // Randomly decide direction for this vocab (true = source->target, false = target->source)
                    const isSourceToTarget = Math.random() < 0.5;

                    // Extract all textTargets as array
                    const textTargetsArray = vocab.textTargets.map((tt) => tt.textTarget);

                    // Create ONE card per vocab with all textTargets as arrays
                    flipCardQuestions.push({
                        frontText: isSourceToTarget ? [vocab.textSource] : textTargetsArray,
                        backText: isSourceToTarget ? textTargetsArray : [vocab.textSource],
                        frontLanguageCode: isSourceToTarget
                            ? vocab.sourceLanguageCode
                            : vocab.targetLanguageCode,
                        backLanguageCode: isSourceToTarget
                            ? vocab.targetLanguageCode
                            : vocab.sourceLanguageCode,
                    });
                });

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                trainer.questionAnswers = JSON.parse(JSON.stringify(flipCardQuestions));
            } else if (trainer.questionType === QuestionType.TRANSLATION_AUDIO) {
                if (trainer.vocabAssignments.length === 0) {
                    trainer.questionAnswers = [];
                } else {
                    const firstVocab = trainer.vocabAssignments[0].vocab;
                    const targetLanguage = firstVocab.targetLanguageCode;
                    const sourceLanguage = firstVocab.sourceLanguageCode;

                    const targetLanguageWords: string[] = [];
                    const sourceLanguageWords: string[] = [];
                    trainer.vocabAssignments.forEach((assignment) => {
                        const vocab = assignment.vocab;
                        if (!sourceLanguageWords.includes(vocab.textSource)) {
                            sourceLanguageWords.push(vocab.textSource);
                        }
                        if (vocab.textTargets && vocab.textTargets.length > 0) {
                            vocab.textTargets.forEach((tt) => {
                                if (!targetLanguageWords.includes(tt.textTarget)) {
                                    targetLanguageWords.push(tt.textTarget);
                                }
                            });
                        }
                    });

                    if (targetLanguageWords.length > 0) {
                        const dialogueResult = await this.aiService.generateDialogueForVocabs(
                            targetLanguageWords,
                            sourceLanguageWords,
                            targetLanguage,
                            sourceLanguage,
                            trainer.userId,
                        );

                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        const dialogue: Array<{ speaker: string; text: string }> = JSON.parse(
                            JSON.stringify(dialogueResult.dialogue),
                        );

                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        trainer.questionAnswers = dialogue;

                        await this.prismaService.vocabTrainer.update({
                            where: { id: trainer.id },
                            data: {
                                questionAnswers: dialogue,
                            },
                        });
                    } else {
                        trainer.questionAnswers = [];
                    }
                }
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

            const passCount =
                overallStatus === TrainerStatus.PASSED
                    ? (trainer.reminderRepeat || 0) + 1
                    : trainer.reminderRepeat || 0;

            const shouldDelete = passCount >= Number(EReminderRepeat.MAX_REPEAT);

            if (shouldDelete) {
                await this.notificationService.create({
                    type: NotificationType.VOCAB_TRAINER,
                    action: NotificationAction.CREATE,
                    priority: PriorityLevel.HIGH,
                    data: {
                        trainerName: trainer.name,
                        message: 'Your test has been completed after 6 passes',
                        completedAt: new Date().toISOString(),
                    },
                    expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                    isActive: true,
                    recipientUserIds: [user.id],
                });

                await this.delete(trainer.id, user.id);
                return new VocabTrainerDto(
                    trainer as unknown as VocabTrainer & {
                        questionAnswers?: MultipleChoiceQuestionDto[];
                    },
                );
            }

            await this.prismaService.vocabTrainer.update({
                where: { id: trainer.id },
                data: {
                    reminderRepeat: passCount,
                    reminderLastRemind: new Date(),
                    reminderDisabled: false,
                },
            });

            // ----------------------Schedule reminder----------------------
            const sendDataReminder = {
                data: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    testName: trainer.name,
                    repeatDays: '2',
                    examUrl: `${process.env.FRONTEND_URL}/${trainer.id}`,
                },
            };

            const sendDataNotification = {
                data: {
                    trainerName: trainer.name,
                    scorePercentage,
                    trainerId: trainer.id,
                    questionType: trainer.questionType,
                    examUrl: `${process.env.FRONTEND_URL}/${trainer.id}/exam/multiple-choice`,
                },
            };

            const lastRemindDate =
                trainer.reminderLastRemind instanceof Date
                    ? trainer.reminderLastRemind
                    : new Date(trainer.reminderLastRemind);

            const reminderIntervalDays = 2;
            const nextReminderTime = new Date(
                lastRemindDate.getTime() + reminderIntervalDays * 24 * 60 * 60 * 1000,
            );
            const delayInMs = Math.max(0, nextReminderTime.getTime() - new Date().getTime());

            // Send reminder email
            await this.reminderService.scheduleReminder(
                user.email,
                EReminderTitle.VOCAB_TRAINER,
                EEmailTemplate.EXAM_REMINDER,
                sendDataReminder.data,
                delayInMs,
            );

            await this.reminderService.sendImmediateCreateNotification(
                [user.id],
                EReminderTitle.VOCAB_TRAINER,
                sendDataNotification.data,
            );

            // Send notification
            await this.reminderService.scheduleCreateNotification(
                [user.id],
                EReminderTitle.VOCAB_TRAINER,
                sendDataNotification.data,
                delayInMs,
            );

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

    public async submitFillInBlank(
        id: string,
        input: SubmitFillInBlankInput,
        user: User,
    ): Promise<VocabTrainerDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (user.id) {
                where.userId = user.id;
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
                },
            });

            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            const { countTime, wordTestInputs } = input;

            const createResults: Prisma.VocabTrainerResultCreateManyInput[] = [];
            let correctAnswers = 0;

            for (const answerSubmission of wordTestInputs) {
                let matchedVocabAssignment = null;
                let answerType: 'textSource' | 'textTarget' = 'textTarget';

                for (const vocabAssignment of trainer.vocabAssignments) {
                    const vocabItem = vocabAssignment.vocab;

                    if (vocabItem.textSource === answerSubmission.systemAnswer) {
                        matchedVocabAssignment = vocabAssignment;
                        answerType = 'textSource';
                        break;
                    }

                    if (vocabItem.textTargets && vocabItem.textTargets.length > 0) {
                        const matchingTextTarget = vocabItem.textTargets.find(
                            (textTarget) => textTarget.textTarget === answerSubmission.systemAnswer,
                        );
                        if (matchingTextTarget) {
                            matchedVocabAssignment = vocabAssignment;
                            answerType = 'textTarget';
                            break;
                        }
                    }
                }

                if (!matchedVocabAssignment) {
                    this.logger.warn(
                        `Could not find vocab for systemAnswer "${answerSubmission.systemAnswer}"`,
                    );
                    continue;
                }

                const vocab = matchedVocabAssignment.vocab;

                let isCorrect = false;
                let explanation: string | undefined;
                try {
                    const evaluation = await this.aiService.evaluateFillInBlankAnswer(
                        vocab,
                        answerSubmission.userAnswer,
                        answerSubmission.systemAnswer,
                        answerType,
                        user.id,
                    );
                    isCorrect = evaluation.isCorrect;
                    explanation = evaluation.explanation;
                } catch (error) {
                    this.logger.error(
                        `Error evaluating answer for systemAnswer "${answerSubmission.systemAnswer}":`,
                        error,
                    );
                    isCorrect = false;
                }

                if (isCorrect) {
                    correctAnswers++;
                }

                createResults.push({
                    vocabTrainerId: trainer.id,
                    status: isCorrect ? TrainerStatus.PASSED : TrainerStatus.FAILED,
                    userSelected: answerSubmission.userAnswer,
                    systemSelected: answerSubmission.systemAnswer,
                    data: { explanation: explanation || undefined },
                });
            }

            await this.prismaService.vocabTrainerResult.deleteMany({
                where: { vocabTrainerId: trainer.id },
            });
            await this.prismaService.vocabTrainerResult.createMany({ data: createResults });

            const totalQuestions = wordTestInputs.length;
            const scorePercentage = (correctAnswers / totalQuestions) * 100;
            const overallStatus =
                scorePercentage >= 70 ? TrainerStatus.PASSED : TrainerStatus.FAILED;

            const passCount =
                overallStatus === TrainerStatus.PASSED
                    ? (trainer.reminderRepeat || 0) + 1
                    : trainer.reminderRepeat || 0;

            const shouldDelete = passCount >= Number(EReminderRepeat.MAX_REPEAT);

            if (shouldDelete) {
                await this.notificationService.create({
                    type: NotificationType.VOCAB_TRAINER,
                    action: NotificationAction.CREATE,
                    priority: PriorityLevel.HIGH,
                    data: {
                        trainerName: trainer.name,
                        message: 'Your test has been completed after 6 passes',
                        completedAt: new Date().toISOString(),
                    },
                    expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                    isActive: true,
                    recipientUserIds: [user.id],
                });

                await this.delete(trainer.id, user.id);
                return new VocabTrainerDto(
                    trainer as unknown as VocabTrainer & {
                        questionAnswers?: MultipleChoiceQuestionDto[];
                    },
                );
            }

            await this.prismaService.vocabTrainer.update({
                where: { id: trainer.id },
                data: {
                    reminderRepeat: passCount,
                    reminderLastRemind: new Date(),
                    reminderDisabled: false,
                },
            });

            const sendDataReminder = {
                data: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    testName: trainer.name,
                    repeatDays: '2',
                    examUrl: `${process.env.FRONTEND_URL}/${trainer.id}`,
                },
            };

            const sendDataNotification = {
                data: {
                    trainerName: trainer.name,
                    scorePercentage,
                    trainerId: trainer.id,
                    questionType: trainer.questionType,
                    examUrl: `${process.env.FRONTEND_URL}/${trainer.id}/exam/fill-in-blank`,
                },
            };

            const lastRemindDate =
                trainer.reminderLastRemind instanceof Date
                    ? trainer.reminderLastRemind
                    : new Date(trainer.reminderLastRemind);

            const reminderIntervalDays = 2;
            const nextReminderTime = new Date(
                lastRemindDate.getTime() + reminderIntervalDays * 24 * 60 * 60 * 1000,
            );
            const delayInMs = Math.max(0, nextReminderTime.getTime() - new Date().getTime());

            await this.reminderService.scheduleReminder(
                user.email,
                EReminderTitle.VOCAB_TRAINER,
                EEmailTemplate.EXAM_REMINDER,
                sendDataReminder.data,
                delayInMs,
            );

            await this.reminderService.sendImmediateCreateNotification(
                [user.id],
                EReminderTitle.VOCAB_TRAINER,
                sendDataNotification.data,
            );

            await this.reminderService.scheduleCreateNotification(
                [user.id],
                EReminderTitle.VOCAB_TRAINER,
                sendDataNotification.data,
                delayInMs,
            );

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
            PrismaErrorHandler.handle(error, 'submitFillInBlank', this.errorMapping);
        }
    }

    public async submitTranslationAudio(
        id: string,
        input: SubmitTranslationAudioInput,
        user: User,
    ): Promise<SubmitTranslationAudioResponseDto> {
        try {
            const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
                id,
            };
            if (user.id) {
                where.userId = user.id;
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
                },
            });

            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            if (trainer.questionType !== QuestionType.TRANSLATION_AUDIO) {
                throw new BadRequestException('Question type is not TRANSLATION_AUDIO');
            }

            const { fileId, targetStyle, targetAudience, countTime } = input;

            if (fileId) {
                try {
                    await this.aiService.downloadAudioFromCloudinary(fileId);
                } catch (error) {
                    this.logger.error(`Failed to download audio from Cloudinary: ${error}`);
                    throw new BadRequestException(
                        `Invalid fileId: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }

            if (!trainer.questionAnswers || !Array.isArray(trainer.questionAnswers)) {
                throw new BadRequestException('Dialogue not found in questionAnswers');
            }

            const targetDialogue = trainer.questionAnswers as Array<{
                speaker: string;
                text: string;
            }>;

            if (targetDialogue.length === 0) {
                throw new BadRequestException('Dialogue is empty');
            }

            const firstVocab = trainer.vocabAssignments[0]?.vocab;
            if (!firstVocab) {
                throw new BadRequestException('No vocab assignments found');
            }

            const sourceLanguage = firstVocab.sourceLanguageCode;
            const targetLanguage = firstVocab.targetLanguageCode;

            const sourceWords: string[] = [];
            trainer.vocabAssignments.forEach((assignment) => {
                const vocab = assignment.vocab;
                if (!sourceWords.includes(vocab.textSource)) {
                    sourceWords.push(vocab.textSource);
                }
            });

            const { jobId } = await this.aiService.queueAudioEvaluation({
                fileId,
                targetDialogue,
                sourceLanguage,
                targetLanguage,
                sourceWords,
                targetStyle,
                targetAudience,
                userId: user.id,
                vocabTrainerId: trainer.id,
            });

            await this.prismaService.vocabTrainer.update({
                where: { id: trainer.id },
                data: {
                    countTime,
                    updatedAt: new Date(),
                },
            });

            const result = await this.prismaService.vocabTrainer.findFirst({
                where: { id: trainer.id },
                include: {
                    results: true,
                },
            });

            if (!result) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found after update`);
            }

            return {
                trainer: new VocabTrainerDto(
                    result as unknown as VocabTrainer & {
                        questionAnswers?: Array<{ speaker: string; text: string }>;
                    },
                ),
                jobId,
            };
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
                    reminderRepeat: trainerData.reminderRepeat ?? 0,
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
