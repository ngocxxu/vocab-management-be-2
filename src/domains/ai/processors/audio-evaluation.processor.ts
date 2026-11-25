import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { AudioEvaluationJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';
import type { Job } from 'bull';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { EReminderType } from '../../reminder/utils';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { isSupersededAttempt } from '../../vocab-trainer/utils/pass-rules.util';
import { AiService } from '../services/ai.service';
import { GradingNotificationService } from '../services/grading-notification.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { classifyAiJobFailure, mayRecordGradingFailure, recordGradingFailure, StaleAiJobError, withAiCallTimeout } from '../utils/ai-job.util';

type AudioCompleted = { transcript?: string; markdownReport?: string; superseded?: boolean; trainerDeleted?: boolean };

type WriteOutcome = { kind: 'applied'; trainerName: string } | { kind: 'deleted' } | { kind: 'superseded' };

/** Audio never counts a Pass, so this processor never calls the attempt service. It only writes the result and the grading state (#17). */
@Injectable()
@Processor(EReminderType.AUDIO_EVALUATION)
export class AudioEvaluationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly vocabTrainerJobLockService: VocabTrainerJobLockService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly gradingNotifications: GradingNotificationService,
    ) {}

    @Process({
        name: 'evaluate-audio',
        concurrency: QUEUE_CONFIG[EReminderType.AUDIO_EVALUATION].concurrency,
    })
    public async processAudioEvaluation(job: Job<AudioEvaluationJobData>): Promise<object> {
        const { fileId, targetDialogue, sourceLanguageCode, targetLanguageCode, sourceWords, targetStyle, targetAudience, userId, vocabTrainerId, lockToken } = job.data;

        const jobId = String(job.id ?? '');
        // The submit time says which submit this job may write for. Jobs queued before #17 have none: the job time.
        const submittedAt = new Date(job.data.submittedAt ?? job.timestamp);

        try {
            const ownsLock = await this.vocabTrainerJobLockService.isOwner(userId, String(jobId), lockToken);
            if (!ownsLock) {
                this.logger.warn(`Skipping stale audio evaluation job ${jobId} for user ${userId}`);
                throw new StaleAiJobError(jobId, userId);
            }

            await this.vocabTrainerJobLockService.refreshLock(userId, lockToken, job.attemptsMade);
            this.logger.info(`Processing audio evaluation job ${job.id} for user ${userId}`);

            // A newer submit replaced this one: do not call the AI for it (the check under the row lock below is the guard).
            if (isSupersededAttempt(await this.vocabTrainerRepository.findAttemptByTrainerId(vocabTrainerId, userId), submittedAt)) {
                this.logger.warn(`Audio job ${jobId} is superseded by a newer submit of trainer ${vocabTrainerId}: skipped`);
                return this.finish(userId, jobId, lockToken, { superseded: true });
            }

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'evaluating');

            const audioBuffer = await withAiCallTimeout(this.aiService.downloadAudioFromCloudinary(fileId), 'Audio download');
            const mimeType = 'audio/webm';

            const transcript = await withAiCallTimeout(this.aiService.transcribeAudio(audioBuffer, mimeType, sourceLanguageCode, userId), 'Audio transcription');

            const evaluationResult = await withAiCallTimeout(
                this.aiService.evaluateTranslation({
                    targetDialogue,
                    transcript,
                    sourceLanguageCode,
                    targetLanguageCode,
                    sourceWords,
                    targetStyle,
                    targetAudience,
                    userId,
                    locale: job.data.locale,
                }),
                'Translation evaluation',
            );

            const markdownReport = this.aiService.formatMarkdownReport(evaluationResult, transcript);

            const outcome = await this.vocabTrainerRepository.runSerializableWithRetry(async (tx): Promise<WriteOutcome> => {
                const trainer = await this.vocabTrainerRepository.lockAndFindForUpdate(tx, vocabTrainerId);
                if (!trainer) {
                    return { kind: 'deleted' };
                }
                if (isSupersededAttempt(await this.vocabTrainerRepository.findAttemptByTrainerId(vocabTrainerId, userId, tx), submittedAt)) {
                    return { kind: 'superseded' };
                }

                // Delete and create in one transaction: if the new result cannot be written, the old one stays (#17).
                await this.vocabTrainerRepository.deleteVocabTrainerResults(vocabTrainerId, tx);
                await this.vocabTrainerRepository.createVocabTrainerResult(
                    {
                        vocabTrainerId,
                        status: TrainerStatus.COMPLETED,
                        userSelected: transcript,
                        systemSelected: targetDialogue.map((d) => d.text).join(' '),
                        data: {
                            transcript,
                            markdownReport,
                        },
                    },
                    tx,
                );
                // Same transaction as the result: a graded submit always has its result (#17).
                await this.vocabTrainerRepository.markAttemptGraded(vocabTrainerId, userId, submittedAt, tx);

                return { kind: 'applied', trainerName: trainer.name };
            });

            if (outcome.kind === 'deleted') {
                this.logger.warn(`Trainer ${vocabTrainerId} was deleted while audio job ${jobId} ran: nothing written`);
                return this.finish(userId, jobId, lockToken, { trainerDeleted: true });
            }
            if (outcome.kind === 'superseded') {
                this.logger.warn(`Audio job ${jobId} was superseded while it ran: nothing written`);
                return this.finish(userId, jobId, lockToken, { superseded: true });
            }

            await this.gradingNotifications.notifyGraded({ trainerId: vocabTrainerId, userId, trainerName: outcome.trainerName, examType: 'translation-audio' });

            // Also stored by Bull as the job's return value, which the job-status endpoint serves.
            return this.finish(userId, jobId, lockToken, { transcript, markdownReport });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Audio evaluation job ${job.id} failed: ${errorMessage}`);

            const { permanent, finalAttempt } = classifyAiJobFailure(job, error);
            if (finalAttempt) {
                // Written before the event, so a client that asks next sees grading_failed. It never blocks the lock release.
                // A stale job writes only when no other job holds the user's lock: that job owns the submit now (#17).
                if (await mayRecordGradingFailure(error, async () => this.vocabTrainerJobLockService.getActiveJob(userId))) {
                    const marked = await recordGradingFailure(
                        async () => this.vocabTrainerRepository.markAttemptGradingFailed(vocabTrainerId, userId, submittedAt),
                        this.logger,
                        jobId,
                    );
                    if (marked) {
                        await this.gradingNotifications.notifyFailed({ trainerId: vocabTrainerId, userId, examType: 'translation-audio' });
                    }
                }
                this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'failed', { error: errorMessage });
                await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
            } else {
                this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'evaluating');
            }
            if (permanent) {
                await job.discard();
            }

            throw error;
        }
    }

    /** Reports the outcome, releases the user's job lock and returns the job's return value (served by the job-status endpoint). */
    private async finish(userId: string, jobId: string, lockToken: string, payload: AudioCompleted): Promise<AudioCompleted> {
        this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'completed', { transcript: payload.transcript, markdownReport: payload.markdownReport });
        await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
        this.logger.info(`Audio evaluation finished for user ${userId}`);

        return payload;
    }
}
