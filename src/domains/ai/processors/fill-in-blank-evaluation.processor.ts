import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { FillInBlankEvaluationJobData } from '@/queues/interfaces/job-payloads';
import { captureSentryException, LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';
import type { Job } from 'bull';
import { UserRepository } from '../../identity/user/repositories';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { EReminderType } from '../../reminder/utils';
import { VocabMasteryService } from '../../vocab/services/vocab-mastery.service';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { AttemptOutcome, VocabTrainerAttemptService } from '../../vocab-trainer/services/vocab-trainer-attempt.service';
import { EQuestionType } from '../../vocab-trainer/utils';
import { isAttemptApplied } from '../../vocab-trainer/utils/pass-rules.util';
import { AiService } from '../services/ai.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { classifyAiJobFailure, StaleAiJobError, withAiCallTimeout } from '../utils/ai-job.util';

type ResultPayload = { status: TrainerStatus; userSelected: string; systemSelected: string; data?: { explanation?: string } };

type CompletedPayload = { results: ResultPayload[]; trainerDeleted?: boolean };

type ApplyOutcome = { kind: 'deleted' } | { kind: 'already-applied' } | { kind: 'applied'; attempt: AttemptOutcome };

@Injectable()
@Processor(EReminderType.FILL_IN_BLANK_EVALUATION)
export class FillInBlankEvaluationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly vocabTrainerJobLockService: VocabTrainerJobLockService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly userRepository: UserRepository,
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly vocabTrainerAttempt: VocabTrainerAttemptService,
    ) {}

    @Process({
        name: 'evaluate-answers',
        concurrency: QUEUE_CONFIG[EReminderType.FILL_IN_BLANK_EVALUATION].concurrency,
    })
    public async processFillInBlankEvaluation(job: Job<FillInBlankEvaluationJobData>): Promise<object> {
        const { vocabTrainerId, evaluations, answerSubmissions, userId, lockToken } = job.data;
        const jobId = String(job.id ?? '');
        // The decision and the submit time were stored when the job was queued. This run applies them, it never decides again.
        const countsAsAttempt = job.data.countsAsAttempt ?? true;
        const submittedAt = new Date(job.data.submittedAt ?? job.timestamp);

        try {
            const ownsLock = await this.vocabTrainerJobLockService.isOwner(userId, String(jobId), lockToken);
            if (!ownsLock) {
                this.logger.warn(`Skipping stale fill-in-blank evaluation job ${jobId} for user ${userId}`);
                throw new StaleAiJobError(jobId, userId);
            }

            await this.vocabTrainerJobLockService.refreshLock(userId, lockToken, job.attemptsMade);
            this.logger.info(`Processing fill-in-blank evaluation job ${job.id} for user ${userId}`);

            // A retry after the attempt was applied must not call the AI or count again: it only re-sends the stored result.
            const current = await this.vocabTrainerRepository.findVocabTrainerByIdMinimal(vocabTrainerId);
            if (!current) {
                this.logger.warn(`Trainer ${vocabTrainerId} was deleted before fill-in-blank job ${jobId} ran`);
                return this.complete(userId, jobId, lockToken, { results: [], trainerDeleted: true });
            }
            if (isAttemptApplied(current, submittedAt)) {
                const stored = await this.vocabTrainerRepository.findResultsByTrainerId(vocabTrainerId);
                return this.complete(userId, jobId, lockToken, { results: stored.map((row) => this.toResultPayload(row)) });
            }

            this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'evaluating');

            const evaluationResults = await withAiCallTimeout(
                this.aiService.evaluateAllFillInBlankAnswers(
                    evaluations.map((evaluation) => ({
                        vocab: evaluation.vocab,
                        userAnswer: evaluation.userAnswer,
                        systemAnswer: evaluation.systemAnswer,
                        questionType: evaluation.questionType,
                    })),
                    userId,
                    job.data.locale,
                ),
                'Fill-in-blank evaluation',
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
            const completedResults: CompletedPayload = { results: createResults.map((result) => this.toResultPayload(result)) };

            const correctAnswers = evaluationResults.filter((r) => r.isCorrect).length;
            const scorePercentage = (correctAnswers / answerSubmissions.length) * 100;
            const overallStatus = scorePercentage >= 70 ? TrainerStatus.PASSED : TrainerStatus.FAILED;

            const user = await this.userRepository.findById(userId);
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }

            // Serializable with retry: a write conflict (P2034) runs this callback again. The AI call stays outside it, so it never repeats.
            const outcome = await this.vocabTrainerRepository.runSerializableWithRetry(async (tx): Promise<ApplyOutcome> => {
                const trainer = await this.vocabTrainerRepository.lockAndFindForUpdate(tx, vocabTrainerId);
                if (!trainer) {
                    return { kind: 'deleted' };
                }
                if (isAttemptApplied(trainer, submittedAt)) {
                    return { kind: 'already-applied' };
                }

                await this.vocabTrainerRepository.deleteVocabTrainerResults(vocabTrainerId, tx);
                await this.vocabTrainerRepository.createVocabTrainerResultsMany(createResults, tx);
                const attempt = await this.vocabTrainerAttempt.applyAttemptTx(tx, {
                    trainer,
                    user,
                    overallStatus,
                    counts: countsAsAttempt,
                    submittedAt,
                    countTime: trainer.countTime,
                    examUrl: `${process.env.FRONTEND_URL}/${trainer.id}/exam/${EQuestionType.FILL_IN_THE_BLANK}`,
                });

                return { kind: 'applied', attempt };
            });

            if (outcome.kind === 'deleted') {
                this.logger.warn(`Trainer ${vocabTrainerId} was deleted while fill-in-blank job ${jobId} ran: nothing written`);
                return this.complete(userId, jobId, lockToken, { ...completedResults, trainerDeleted: true });
            }
            if (outcome.kind === 'already-applied') {
                return this.complete(userId, jobId, lockToken, completedResults);
            }

            await this.recordMastery(createResults, userId);
            await this.vocabTrainerAttempt.afterCommit(outcome.attempt);

            return this.complete(userId, jobId, lockToken, completedResults);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Fill-in-blank evaluation job ${job.id} failed: ${errorMessage}`);

            const { permanent, finalAttempt } = classifyAiJobFailure(job, error);
            if (finalAttempt) {
                this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'failed', { error: errorMessage });
                await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
            } else {
                this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'evaluating');
            }
            if (permanent) {
                await job.discard();
            }

            throw error;
        }
    }

    /** Reports the result to the client, releases the user's job lock and returns the job's return value (served by the job-status endpoint). */
    private async complete(userId: string, jobId: string, lockToken: string, payload: CompletedPayload): Promise<CompletedPayload> {
        this.notificationGateway.emitFillInBlankEvaluationProgress(userId, jobId, 'completed', payload);
        await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
        this.logger.info(`Fill-in-blank evaluation job ${jobId} completed successfully`);

        return payload;
    }

    /** Mastery runs after the commit and is best effort: a failure is logged, the attempt stays applied. */
    private async recordMastery(results: Array<{ vocabId: string; status: TrainerStatus }>, userId: string): Promise<void> {
        try {
            for (const result of results) {
                await this.vocabMasteryService.updateMastery(result.vocabId, userId, result.status === TrainerStatus.PASSED);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Mastery update failed after fill-in-blank attempt: ${message}`);
            captureSentryException(error);
        }
    }

    private toResultPayload(result: { status: TrainerStatus; userSelected: string; systemSelected: string; data: unknown }): ResultPayload {
        return {
            status: result.status,
            userSelected: result.userSelected,
            systemSelected: result.systemSelected,
            data: this.toExplanation(result.data),
        };
    }

    /** Stored results keep the explanation as JSON; only a string explanation is sent back. */
    private toExplanation(data: unknown): { explanation?: string } | undefined {
        if (typeof data !== 'object' || data === null) {
            return undefined;
        }
        const explanation = (data as { explanation?: unknown }).explanation;

        return typeof explanation === 'string' ? { explanation } : undefined;
    }
}
