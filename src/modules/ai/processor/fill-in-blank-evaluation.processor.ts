import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { PriorityLevel, NotificationAction, NotificationType, TrainerStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { LoggerService } from '../../common';
import { PrismaService } from '../../common/provider';
import { NotificationGateway } from '../../event/gateway/notification.gateway';
import { NotificationService } from '../../notification/service';
import { ReminderService } from '../../reminder/service';
import { EEmailTemplate, EReminderType, EXPIRES_AT_30_DAYS } from '../../reminder/util';
import { VocabMasteryService } from '../../vocab/service/vocab-mastery.service';
import { EReminderRepeat, VocabWithTextTargets } from '../../vocab-trainer/util';
import { AiService } from '../service/ai.service';

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
        private readonly prismaService: PrismaService,
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly notificationService: NotificationService,
        private readonly reminderService: ReminderService,
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

            await this.prismaService.vocabTrainerResult.deleteMany({
                where: { vocabTrainerId },
            });

            await this.prismaService.vocabTrainerResult.createMany({
                data: createResults,
            });

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

            const trainer = await this.prismaService.vocabTrainer.findUnique({
                where: { id: vocabTrainerId },
            });

            if (!trainer) {
                throw new Error(`Trainer ${vocabTrainerId} not found`);
            }

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
                    recipientUserIds: [userId],
                });

                await this.prismaService.vocabTrainer.delete({
                    where: { id: vocabTrainerId },
                });
            } else {
                await this.prismaService.vocabTrainer.update({
                    where: { id: vocabTrainerId },
                    data: {
                        status: overallStatus,
                        reminderRepeat: passCount,
                        reminderLastRemind: new Date(),
                        reminderDisabled: false,
                    },
                });

                const user = await this.prismaService.user.findUnique({
                    where: { id: userId },
                });

                if (user) {
                    const lastRemindDate =
                        trainer.reminderLastRemind instanceof Date
                            ? trainer.reminderLastRemind
                            : new Date(trainer.reminderLastRemind);

                    const daysSinceLastRemind = Math.floor(
                        (Date.now() - lastRemindDate.getTime()) / (1000 * 60 * 60 * 24),
                    );

                    if (daysSinceLastRemind >= 2 || !trainer.reminderLastRemind) {
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

                        await this.reminderService.scheduleReminder(
                            user.email,
                            EReminderType.NOTIFICATION,
                            EEmailTemplate.REMINDER,
                            sendDataReminder.data,
                            2 * 24 * 60 * 60 * 1000,
                        );

                        await this.notificationService.create({
                            type: NotificationType.VOCAB_TRAINER,
                            action: NotificationAction.CREATE,
                            priority: PriorityLevel.HIGH,
                            data: sendDataNotification.data,
                            expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                            isActive: true,
                            recipientUserIds: [userId],
                        });
                    }
                }
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
