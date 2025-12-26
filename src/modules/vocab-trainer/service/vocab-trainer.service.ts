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
import { AiService } from '../../ai/service/ai.service';
import { PrismaErrorHandler } from '../../common/handler';
import { PaginationDto } from '../../common/model';
import { PrismaService } from '../../common/provider';
import { getOrderBy, getPagination } from '../../common/util';
import { NotificationService } from '../../notification/service';
import { ReminderService } from '../../reminder/service';
import { EEmailTemplate, EReminderTitle, EXPIRES_AT_30_DAYS } from '../../reminder/util';
import { VocabMasteryService } from '../../vocab/service/vocab-mastery.service';
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
import { VocabTrainerRepository } from '../repository';
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
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly prismaService: PrismaService,
        private readonly reminderService: ReminderService,
        private readonly aiService: AiService,
        private readonly notificationService: NotificationService,
        private readonly vocabMasteryService: VocabMasteryService,
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

            const { totalItems, trainers } = await this.vocabTrainerRepository.findWithPagination(
                query,
                userId,
                skip,
                take,
                orderBy,
            );
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

            const trainer = await this.vocabTrainerRepository.findById(id, userId);
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

            const trainer = await this.vocabTrainerRepository.findByIdWithVocabs(id, userId);
            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            // -----------------------------Create multiple choice questions-------------------------------
            if (trainer.questionType === QuestionType.MULTIPLE_CHOICE) {
                const dataVocabAssignments: VocabWithTextTargets[] = (
                    trainer as VocabTrainer & {
                        vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                    }
                ).vocabAssignments.map((vocabAssignment) => vocabAssignment.vocab);

                // Check if questions already exist
                const isQuestionAnswersExist =
                    trainer.questionAnswers &&
                    Array.isArray(trainer.questionAnswers) &&
                    trainer.questionAnswers.length > 0;

                if (!isQuestionAnswersExist) {
                    // Queue generation job
                    const { jobId } = await this.aiService.queueMultipleChoiceGeneration({
                        vocabTrainerId: trainer.id,
                        vocabList: dataVocabAssignments,
                        userId: trainer.userId,
                    });

                    trainer.questionAnswers = [];
                    // Add jobId to trainer object for response
                    (trainer as VocabTrainer & { jobId?: string }).jobId = jobId;
                }
            } else if (trainer.questionType === QuestionType.FILL_IN_THE_BLANK) {
                const fillInBlankQuestions: Array<{
                    correctAnswer: string;
                    type: 'textSource' | 'textTarget';
                    content: string;
                    vocabId: string;
                }> = [];

                (
                    trainer as VocabTrainer & {
                        vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                    }
                ).vocabAssignments.forEach((assignment) => {
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

                (
                    trainer as VocabTrainer & {
                        vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                    }
                ).vocabAssignments.forEach((assignment) => {
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
                const trainerWithVocabs = trainer as VocabTrainer & {
                    vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                };
                if (trainerWithVocabs.vocabAssignments.length === 0) {
                    trainer.questionAnswers = [];
                } else {
                    const firstVocab = trainerWithVocabs.vocabAssignments[0].vocab;
                    const targetLanguage = firstVocab.targetLanguageCode;
                    const sourceLanguage = firstVocab.sourceLanguageCode;

                    const targetLanguageWords: string[] = [];
                    const sourceLanguageWords: string[] = [];
                    trainerWithVocabs.vocabAssignments.forEach((assignment) => {
                        const vocab = assignment.vocab;
                        if (!sourceLanguageWords.includes(vocab.textSource)) {
                            sourceLanguageWords.push(vocab.textSource);
                        }
                        if (vocab.textTargets && vocab.textTargets.length > 0) {
                            vocab.textTargets.forEach((tt: { textTarget: string }) => {
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

                        await this.vocabTrainerRepository.update(trainer.id, {
                            questionAnswers: dialogue,
                        });
                    } else {
                        trainer.questionAnswers = [];
                    }
                }
            }

            const trainerDto = new VocabTrainerDto(trainer);
            if ((trainer as VocabTrainer & { jobId?: string }).jobId) {
                trainerDto.jobId = (trainer as VocabTrainer & { jobId?: string }).jobId;
            }
            return trainerDto;
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

            const trainer = (await this.vocabTrainerRepository.findByIdWithVocabsAndResults(
                id,
                user.id,
            )) as unknown as VocabTrainerWithTypedAnswers & {
                vocabAssignments?: Array<{
                    vocab: VocabWithTextTargets;
                }>;
            };
            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            const { countTime, wordTestSelects } = input;

            // Map vocabId from questionAnswers or vocabAssignments
            const questionAnswers = trainer.questionAnswers as Array<{
                vocabId?: string;
                correctAnswer?: string;
                options?: Array<{ label: string; value: string }>;
            }>;

            const vocabIdMap = new Map<string, string>();

            // Try to get vocabId from questionAnswers first
            questionAnswers.forEach((q) => {
                if (q.vocabId && q.correctAnswer) {
                    vocabIdMap.set(q.correctAnswer, q.vocabId);
                }
                // Also map from options if available
                if (q.options) {
                    q.options.forEach((opt) => {
                        if (q.vocabId) {
                            vocabIdMap.set(opt.value, q.vocabId);
                        }
                    });
                }
            });

            const trainerWithVocabs = trainer as unknown as VocabTrainer & {
                vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
            };
            if (trainerWithVocabs.vocabAssignments) {
                trainerWithVocabs.vocabAssignments.forEach((assignment) => {
                    const vocab = assignment.vocab;
                    vocabIdMap.set(vocab.textSource, vocab.id);
                    vocab.textTargets?.forEach((tt) => {
                        vocabIdMap.set(tt.textTarget, vocab.id);
                    });
                });
            }

            // Use the utility function for answer evaluation
            const { createResults, correctAnswers } = evaluateMultipleChoiceAnswers(
                trainer.id,
                wordTestSelects,
                vocabIdMap,
            );

            // Batch insert all results
            await this.vocabTrainerRepository.deleteResultsByTrainerId(trainer.id);
            await this.vocabTrainerRepository.createResults(createResults);

            // Update mastery scores for each vocab
            for (const resultItem of createResults) {
                const vocabId = (
                    resultItem as Prisma.VocabTrainerResultCreateManyInput & { vocabId?: string }
                ).vocabId;
                if (vocabId) {
                    const isCorrect = resultItem.status === TrainerStatus.PASSED;
                    await this.vocabMasteryService.updateMastery(vocabId, user.id, isCorrect);
                }
            }

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

            await this.vocabTrainerRepository.update(trainer.id, {
                reminderRepeat: passCount,
                reminderLastRemind: new Date(),
                reminderDisabled: false,
            });

            await this.scheduleReminderForTrainer(
                user,
                trainer,
                scorePercentage,
                `${process.env.FRONTEND_URL}/${trainer.id}/exam/multiple-choice`,
            );

            const result = await this.vocabTrainerRepository.update(trainer.id, {
                name: trainer.name,
                status: overallStatus,
                countTime,
                setCountTime: trainer.setCountTime,
                updatedAt: new Date(),
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

            const trainer = await this.vocabTrainerRepository.findByIdWithVocabsAndResults(
                id,
                user.id,
            );

            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            const { countTime, wordTestInputs } = input;

            const trainerWithVocabs = trainer as VocabTrainer & {
                vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
            };

            const evaluationsToProcess: Array<{
                answerSubmission: (typeof wordTestInputs)[0];
                vocab: VocabWithTextTargets;
                answerType: 'textSource' | 'textTarget';
            }> = [];

            for (const answerSubmission of wordTestInputs) {
                let matchedVocabAssignment = null;
                let answerType: 'textSource' | 'textTarget' = 'textTarget';

                for (const vocabAssignment of trainerWithVocabs.vocabAssignments) {
                    const vocabItem = vocabAssignment.vocab;

                    if (vocabItem.textSource === answerSubmission.systemAnswer) {
                        matchedVocabAssignment = vocabAssignment;
                        answerType = 'textSource';
                        break;
                    }

                    if (vocabItem.textTargets && vocabItem.textTargets.length > 0) {
                        const matchingTextTarget = vocabItem.textTargets.find(
                            (textTarget: { textTarget: string }) =>
                                textTarget.textTarget === answerSubmission.systemAnswer,
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

                evaluationsToProcess.push({
                    answerSubmission,
                    vocab: matchedVocabAssignment.vocab,
                    answerType,
                });
            }

            if (evaluationsToProcess.length > 0) {
                const { jobId } = await this.aiService.queueFillInBlankEvaluation({
                    vocabTrainerId: trainer.id,
                    evaluations: evaluationsToProcess.map((item) => ({
                        vocab: item.vocab,
                        userAnswer: item.answerSubmission.userAnswer,
                        systemAnswer: item.answerSubmission.systemAnswer,
                        questionType: item.answerType,
                        vocabId: item.vocab.id,
                    })),
                    answerSubmissions: wordTestInputs,
                    userId: user.id,
                });

                (trainer as VocabTrainer & { jobId?: string }).jobId = jobId;
            }

            await this.vocabTrainerRepository.update(trainer.id, {
                countTime,
                setCountTime: trainer.setCountTime,
                updatedAt: new Date(),
            });

            return new VocabTrainerDto(
                trainer as unknown as VocabTrainer & {
                    questionAnswers?: MultipleChoiceQuestionDto[];
                    jobId?: string;
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

            const trainer = await this.vocabTrainerRepository.findByIdWithVocabsAndResults(
                id,
                user.id,
            );

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

            const trainerWithVocabs = trainer as unknown as VocabTrainer & {
                vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
            };
            const firstVocab = trainerWithVocabs.vocabAssignments[0]?.vocab;
            if (!firstVocab) {
                throw new BadRequestException('No vocab assignments found');
            }

            const sourceLanguage = firstVocab.sourceLanguageCode;
            const targetLanguage = firstVocab.targetLanguageCode;

            const sourceWords: string[] = [];
            trainerWithVocabs.vocabAssignments.forEach((assignment) => {
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

            await this.vocabTrainerRepository.update(trainer.id, {
                countTime,
                updatedAt: new Date(),
            });

            const result = await this.vocabTrainerRepository.findById(trainer.id);

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
            const trainer = await this.vocabTrainerRepository.create({
                name: trainerData.name,
                status: trainerData.status ?? TrainerStatus.PENDING,
                questionType: trainerData.questionType ?? QuestionType.MULTIPLE_CHOICE,
                reminderTime: trainerData.reminderTime ?? 0,
                countTime: trainerData.countTime ?? 0,
                setCountTime: trainerData.setCountTime ?? 0,
                reminderDisabled: trainerData.reminderDisabled ?? false,
                reminderRepeat: trainerData.reminderRepeat ?? 0,
                reminderLastRemind: trainerData.reminderLastRemind ?? new Date(),
                user: { connect: { id: userId } },
                vocabAssignments:
                    vocabAssignmentIds.length > 0
                        ? {
                              create: vocabAssignmentIds.map((vocabId) => ({
                                  vocab: { connect: { id: vocabId } },
                              })),
                          }
                        : undefined,
            });

            // Fetch the trainer again to include the new assignments
            const trainerWithAssignments = await this.vocabTrainerRepository.findById(trainer.id);

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

            const existing = await this.vocabTrainerRepository.findById(id, userId);
            if (!existing) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }

            const { vocabAssignmentIds, ...trainerData } = input;

            if (vocabAssignmentIds !== undefined) {
                const uniqueVocabIds = [...new Set(vocabAssignmentIds)];

                return await this.prismaService.$transaction(async (tx) => {
                    await tx.vocabTrainer.update({
                        where: { id },
                        data: {
                            name: trainerData.name,
                            status: trainerData.status,
                            questionType: trainerData.questionType ?? existing.questionType,
                            reminderTime: trainerData.reminderTime ?? existing.reminderTime,
                            countTime: trainerData.countTime ?? existing.countTime,
                            setCountTime: trainerData.setCountTime ?? existing.setCountTime,
                            reminderDisabled:
                                trainerData.reminderDisabled ?? existing.reminderDisabled,
                            reminderRepeat: trainerData.reminderRepeat ?? existing.reminderRepeat,
                            reminderLastRemind:
                                trainerData.reminderLastRemind ?? existing.reminderLastRemind,
                        },
                        include: {
                            vocabAssignments: true,
                            results: true,
                        },
                    });

                    await tx.vocabTrainerWord.deleteMany({
                        where: { vocabTrainerId: id },
                    });

                    if (uniqueVocabIds.length > 0) {
                        await tx.vocabTrainerWord.createMany({
                            data: uniqueVocabIds.map((vocabId) => ({
                                vocabTrainerId: id,
                                vocabId,
                            })),
                            skipDuplicates: true,
                        });
                    }

                    const trainerWithAssignments = await tx.vocabTrainer.findUnique({
                        where: { id },
                        include: {
                            vocabAssignments: true,
                            results: true,
                        },
                    });

                    if (!trainerWithAssignments) {
                        throw new NotFoundException(
                            `VocabTrainer with ID ${id} not found after update`,
                        );
                    }

                    return new VocabTrainerDto(trainerWithAssignments);
                });
            }

            const trainer = await this.vocabTrainerRepository.update(id, {
                name: trainerData.name,
                status: trainerData.status,
                questionType: trainerData.questionType ?? existing.questionType,
                reminderTime: trainerData.reminderTime ?? existing.reminderTime,
                countTime: trainerData.countTime ?? existing.countTime,
                setCountTime: trainerData.setCountTime ?? existing.setCountTime,
                reminderDisabled: trainerData.reminderDisabled ?? existing.reminderDisabled,
                reminderRepeat: trainerData.reminderRepeat ?? existing.reminderRepeat,
                reminderLastRemind: trainerData.reminderLastRemind ?? existing.reminderLastRemind,
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

            const trainer = await this.vocabTrainerRepository.delete(id, userId);
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

    private async scheduleReminderForTrainer(
        user: User,
        trainer: Pick<VocabTrainer, 'id' | 'name' | 'questionType' | 'reminderLastRemind'>,
        scorePercentage: number,
        examUrl: string,
    ): Promise<void> {
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
                examUrl,
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
    }
}
