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
import { AiService } from '../../ai/services/ai.service';
import { NotificationService } from '../../notification/services';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services';
import { EXPIRES_AT_30_DAYS } from '../../reminder/utils';
import { PrismaErrorHandler } from '@/shared/handlers';
import { PaginationDto } from '@/shared/dto';
import { getOrderBy, getPagination } from '@/shared/utils';
import { VocabMasteryService } from '../../vocab/services/vocab-mastery.service';
import { VocabTrainerMapper } from '../mappers';
import {
    SubmitFillInBlankInput,
    SubmitMultipleChoiceInput,
    SubmitTranslationAudioInput,
    UpdateVocabTrainerInput,
    VocabTrainerDto,
    VocabTrainerInput,
    VocabTrainerQueryParamsInput,
} from '../dto';
import { SubmitTranslationAudioResponseDto } from '../dto/submit-translation-audio-response.dto';
import { VocabTrainerRepository } from '../repositories';
import {
    EQuestionType,
    EReminderRepeat,
    evaluateMultipleChoiceAnswers,
    VocabTrainerWithTypedAnswers,
    VocabWithTextTargets,
} from '../utils';

export interface FlipCardQuestion {
    frontText: string[];
    backText: string[];
    frontLanguageCode: string;
    backLanguageCode: string;
}

@Injectable()
export class VocabTrainerService {
    private readonly logger = new Logger(VocabTrainerService.name);
    private readonly vocabTrainerMapper = new VocabTrainerMapper();
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
        private readonly vocabTrainerReminderAfterExam: VocabTrainerReminderAfterExamService,
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
            const items = this.vocabTrainerMapper.toResponseList(trainers);
            return this.vocabTrainerMapper.toPaginated(items, totalItems, page, pageSize);
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
            return this.vocabTrainerMapper.toResponse(trainer);
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
                            type: 'textSource',
                            content: `What is the translation of "${vocab.textSource}" in ${vocab.targetLanguageCode}?`,
                            vocabId: vocab.id,
                        });
                    } else {
                        fillInBlankQuestions.push({
                            correctAnswer: vocab.textSource,
                            type: 'textTarget',
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
                    const targetLanguageCode = firstVocab.targetLanguageCode;
                    const sourceLanguageCode = firstVocab.sourceLanguageCode;

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
                            targetLanguageCode,
                            sourceLanguageCode,
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

            const trainerDto = this.vocabTrainerMapper.toResponse(trainer);
            if ((trainer as VocabTrainer & { jobId?: string }).jobId) {
                trainerDto.jobId = (trainer as VocabTrainer & { jobId?: string }).jobId;
            }
            return trainerDto;
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error, 'findOneAndExam', this.errorMapping);
            }
            throw error;
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
            const examUrl = `${process.env.FRONTEND_URL}/${trainer.id}/exam/${EQuestionType.MULTIPLE_CHOICE}`;

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

                await this.vocabTrainerRepository.inTransaction(async (tx) => {
                    await this.vocabTrainerReminderAfterExam.cancelSchedulesForTrainerTx(
                        tx,
                        trainer.id,
                        user.id,
                        'trainer_completed_max_passes',
                    );
                    await this.vocabTrainerRepository.deleteVocabTrainerRow(trainer.id, tx);
                });
                return this.vocabTrainerMapper.toResponse(
                    trainer as unknown as ConstructorParameters<typeof VocabTrainerDto>[0],
                );
            }

            const result = await this.vocabTrainerRepository.inTransaction(async (tx) => {
                await this.vocabTrainerReminderAfterExam.syncRemindersAfterExamSubmission(tx, {
                    trainerId: trainer.id,
                    userId: user.id,
                    userEmail: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    trainerName: trainer.name,
                    scorePercentage,
                    examUrl,
                    reminderDisabled: trainer.reminderDisabled,
                });

                return this.vocabTrainerRepository.updateVocabTrainerWithIncludes(
                    trainer.id,
                    {
                        name: trainer.name,
                        status: overallStatus,
                        countTime,
                        setCountTime: trainer.setCountTime,
                        reminderRepeat: passCount,
                        reminderLastRemind: new Date(),
                        reminderDisabled: false,
                        lastExamSubmittedAt: new Date(),
                        updatedAt: new Date(),
                    },
                    tx,
                );
            });

            await this.vocabTrainerReminderAfterExam.scheduleNotification(
                user,
                {
                    ...trainer,
                    reminderLastRemind: new Date(),
                },
                scorePercentage,
                examUrl,
            );

            return this.vocabTrainerMapper.toResponse(
                result as unknown as ConstructorParameters<typeof VocabTrainerDto>[0],
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
                        answerType = 'textTarget';
                        break;
                    }

                    if (vocabItem.textTargets && vocabItem.textTargets.length > 0) {
                        const matchingTextTarget = vocabItem.textTargets.find(
                            (textTarget: { textTarget: string }) =>
                                textTarget.textTarget === answerSubmission.systemAnswer,
                        );
                        if (matchingTextTarget) {
                            matchedVocabAssignment = vocabAssignment;
                            answerType = 'textSource';
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

            return this.vocabTrainerMapper.toResponse(
                trainer as unknown as ConstructorParameters<typeof VocabTrainerDto>[0],
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

            const sourceLanguageCode = firstVocab.sourceLanguageCode;
            const targetLanguageCode = firstVocab.targetLanguageCode;

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
                sourceLanguageCode,
                targetLanguageCode,
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
                trainer: this.vocabTrainerMapper.toResponse(
                    result as unknown as ConstructorParameters<typeof VocabTrainerDto>[0],
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
            const trainer = await this.vocabTrainerRepository.create(
                this.vocabTrainerMapper.toCreateInput(input, userId),
            );

            // Fetch the trainer again to include the new assignments
            const trainerWithAssignments = await this.vocabTrainerRepository.findById(trainer.id);

            if (!trainerWithAssignments) {
                throw new NotFoundException(
                    `VocabTrainer with ID ${trainer.id} not found after creation`,
                );
            }

            return this.vocabTrainerMapper.toResponse(
                trainerWithAssignments as unknown as ConstructorParameters<
                    typeof VocabTrainerDto
                >[0],
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

                return await this.vocabTrainerRepository.inTransaction(async (tx) => {
                    const trainerWithAssignments =
                        await this.vocabTrainerRepository.replaceVocabTrainerWordAssignments(
                            tx,
                            id,
                            this.vocabTrainerMapper.toScalarPatch(trainerData, existing),
                            existing,
                            uniqueVocabIds,
                        );

                    if (!trainerWithAssignments) {
                        throw new NotFoundException(
                            `VocabTrainer with ID ${id} not found after update`,
                        );
                    }

                    return this.vocabTrainerMapper.toResponse(trainerWithAssignments);
                });
            }

            const trainer = await this.vocabTrainerRepository.update(
                id,
                this.vocabTrainerMapper.buildUpdateInput(trainerData, existing),
            );

            return this.vocabTrainerMapper.toResponse(trainer);
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
            return this.vocabTrainerMapper.toResponse(trainer);
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
