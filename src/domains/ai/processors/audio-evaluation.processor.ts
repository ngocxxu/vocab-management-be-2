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
import { AiService } from '../services/ai.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { classifyAiJobFailure, StaleAiJobError, withAiCallTimeout } from '../utils/ai-job.util';

@Injectable()
@Processor(EReminderType.AUDIO_EVALUATION)
export class AudioEvaluationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly vocabTrainerJobLockService: VocabTrainerJobLockService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
    ) {}

    @Process({
        name: 'evaluate-audio',
        concurrency: QUEUE_CONFIG[EReminderType.AUDIO_EVALUATION].concurrency,
    })
    public async processAudioEvaluation(job: Job<AudioEvaluationJobData>): Promise<object> {
        const { fileId, targetDialogue, sourceLanguageCode, targetLanguageCode, sourceWords, targetStyle, targetAudience, userId, vocabTrainerId, lockToken } = job.data;

        const jobId = String(job.id ?? '');

        try {
            const ownsLock = await this.vocabTrainerJobLockService.isOwner(userId, String(jobId), lockToken);
            if (!ownsLock) {
                this.logger.warn(`Skipping stale audio evaluation job ${jobId} for user ${userId}`);
                throw new StaleAiJobError(jobId, userId);
            }

            await this.vocabTrainerJobLockService.refreshLock(userId, lockToken, job.attemptsMade);
            this.logger.info(`Processing audio evaluation job ${job.id} for user ${userId}`);

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
                }),
                'Translation evaluation',
            );

            const markdownReport = this.aiService.formatMarkdownReport(evaluationResult, transcript);

            await this.vocabTrainerRepository.deleteVocabTrainerResults(vocabTrainerId);

            await this.vocabTrainerRepository.createVocabTrainerResult({
                vocabTrainerId,
                status: TrainerStatus.COMPLETED,
                userSelected: transcript,
                systemSelected: targetDialogue.map((d) => d.text).join(' '),
                data: {
                    transcript,
                    markdownReport,
                },
            });

            // Also stored by Bull as the job's return value, which the job-status endpoint serves.
            const completed = { transcript, markdownReport };
            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'completed', completed);
            await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);

            this.logger.info(`Audio evaluation job ${job.id} completed successfully`);
            return completed;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Audio evaluation job ${job.id} failed: ${errorMessage}`);

            const { permanent, finalAttempt } = classifyAiJobFailure(job, error);
            if (finalAttempt) {
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
}
