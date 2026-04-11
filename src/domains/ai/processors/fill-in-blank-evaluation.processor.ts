import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { PriorityLevel, NotificationAction, NotificationType, TrainerStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { LoggerService } from '@/shared';
import { UserRepository } from '../../identity/user/repositories';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { NotificationService } from '../../notification/services';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services';
import { EReminderType, EXPIRES_AT_30_DAYS } from '../../reminder/utils';
import { VocabMasteryService } from '../../vocab/services/vocab-mastery.service';
import { EQuestionType, EReminderRepeat, VocabWithTextTargets } from '../../vocab-trainer/utils';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { AiService } from '../services/ai.service';

export interface FillInBlankEvaluationJobData {
    vocabTrainerId: string;
    evaluations: Array<{
        vocab: VocabWithTextTargets;
        userAnswer: string;
        systemAnswer: string;
        questionType: 'textSource' | 'textTarget';
        vocabId: string;
    }>;
    answerSubmissions: Array<{
        userAnswer: string;
        systemAnswer: string;
    }>;
    userId: string;
}

@Injectable()
@Processor(EReminderType.FILL_IN_BLANK_EVALUATION)
export class FillInBlankEvaluationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly userRepository: UserRepository,
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly notificationService: NotificationService,
        private readonly vocabTrainerReminderAfterExam: VocabTrainerReminderAfterExamService,
    ) {}

    @Process('evaluate-answers')
    public async processFillInBlankEvaluation(
        job: Job<FillInBlankEvaluationJobData>,
    ): Promise<void> {
        const { vocabTrainerId, evaluations, answerSubmissions, userId } = job.data;
        const jobId = job.id || '';

        try {
            this.logger.info(
                `Processing fill-in-blank evaluation job ${job.id} for user ${userId}`,
            );

            this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'evaluating');

            const evaluationResults = await this.aiService.evaluateAllFillInBlankAnswers(
                evaluations.map((evaluation) => ({
                    vocab: evaluation.vocab,
                    userAnswer: evaluation.userAnswer,
                    systemAnswer: evaluation.systemAnswer,
                    questionType: evaluation.questionType,
                })),
                userId,
            );

            const createResults = evaluations.map((evaluation, index) => {
                const result = evaluationResults[index] || { isCorrect: false };
                return {
                    vocabTrainerId,
                    vocabId: evaluation.vocabId,
                    status: result.isCorrect ? TrainerStatus.PASSED : TrainerStatus.FAILED,
                    userSelected: evaluation.userAnswer,
                    systemSelected: evaluation.systemAnswer,
                    data: { explanation: result.explanation || undefined },
                };
            });

            await this.vocabTrainerRepository.deleteVocabTrainerResults(vocabTrainerId);

            await this.vocabTrainerRepository.createVocabTrainerResultsMany(createResults);

            for (const resultItem of createResults) {
                const vocabId = resultItem.vocabId;
                if (vocabId) {
                    const isCorrect = resultItem.status === TrainerStatus.PASSED;
                    await this.vocabMasteryService.updateMastery(vocabId, userId, isCorrect);
                }
            }

            const totalQuestions = answerSubmissions.length;
            const correctAnswers = evaluationResults.filter((r) => r.isCorrect).length;
            const scorePercentage = (correctAnswers / totalQuestions) * 100;
            const overallStatus =
                scorePercentage >= 70 ? TrainerStatus.PASSED : TrainerStatus.FAILED;

            const trainer = await this.vocabTrainerRepository.findVocabTrainerByIdMinimal(
                vocabTrainerId,
            );

            if (!trainer) {
                throw new Error(`Trainer ${vocabTrainerId} not found`);
            }

            const passCount =
                overallStatus === TrainerStatus.PASSED
                    ? (trainer.reminderRepeat || 0) + 1
                    : trainer.reminderRepeat || 0;

            const shouldDelete = passCount >= Number(EReminderRepeat.MAX_REPEAT);
            const examUrl = `${process.env.FRONTEND_URL}/${trainer.id}/exam/${EQuestionType.FILL_IN_THE_BLANK}`;

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
                    recipientUserIds: [userId],
                });

                await this.vocabTrainerRepository.inTransaction(async (tx) => {
                    await this.vocabTrainerReminderAfterExam.cancelSchedulesForTrainerTx(
                        tx,
                        vocabTrainerId,
                        userId,
                        'trainer_completed_max_passes',
                    );
                    await this.vocabTrainerRepository.deleteVocabTrainerRow(vocabTrainerId, tx);
                });
            } else {
                const user = await this.userRepository.findById(userId);

                if (!user) {
                    throw new Error(`User ${userId} not found`);
                }

                const updated = await this.vocabTrainerRepository.inTransaction(async (tx) => {
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
                        vocabTrainerId,
                        {
                            status: overallStatus,
                            reminderRepeat: passCount,
                            reminderLastRemind: new Date(),
                            reminderDisabled: false,
                            lastExamSubmittedAt: new Date(),
                        },
                        tx,
                    );
                });

                await this.vocabTrainerReminderAfterExam.scheduleNotification(
                    user,
                    {
                        ...updated,
                        reminderLastRemind: new Date(),
                    },
                    scorePercentage,
                    examUrl,
                );
            }

            this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'completed', {
                results: createResults.map((result) => ({
                    status: result.status,
                    userSelected: result.userSelected,
                    systemSelected: result.systemSelected,
                    data: result.data,
                })),
            });

            this.logger.info(`Fill-in-blank evaluation job ${job.id} completed successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Fill-in-blank evaluation job ${job.id} failed: ${errorMessage}`);

            this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'failed', {
                error: errorMessage,
            });

            throw error;
        }
    }
}
