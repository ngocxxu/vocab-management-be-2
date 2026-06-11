import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { AudioEvaluationJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { EReminderType } from '../../reminder/utils';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { AiService } from '../services/ai.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { isAiRateLimitError } from '../utils/ai-rate-limit.util';

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
    public async processAudioEvaluation(job: Job<AudioEvaluationJobData>): Promise<void> {
        const { fileId, targetDialogue, sourceLanguageCode, targetLanguageCode, sourceWords, targetStyle, targetAudience, userId, vocabTrainerId, lockToken } = job.data;

        const jobId = job.id || '';

        try {
            const ownsLock = await this.vocabTrainerJobLockService.isOwner(userId, String(jobId), lockToken);
            if (!ownsLock) {
                this.logger.warn(`Skipping stale audio evaluation job ${jobId} for user ${userId}`);
                return;
            }

            await this.vocabTrainerJobLockService.refreshLock(userId, lockToken, job.attemptsMade);
            this.logger.info(`Processing audio evaluation job ${job.id} for user ${userId}`);

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'evaluating');

            const audioBuffer = await this.aiService.downloadAudioFromCloudinary(fileId);
            const mimeType = 'audio/webm';

            const transcript = await this.aiService.transcribeAudio(audioBuffer, mimeType, sourceLanguageCode, userId);

            const evaluationResult = await this.aiService.evaluateTranslation({
                targetDialogue,
                transcript,
                sourceLanguageCode,
                targetLanguageCode,
                sourceWords,
                targetStyle,
                targetAudience,
                userId,
            });

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

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'completed', {
                transcript,
                markdownReport,
            });
            await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);

            this.logger.info(`Audio evaluation job ${job.id} completed successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Audio evaluation job ${job.id} failed: ${errorMessage}`);

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'failed', {
                error: errorMessage,
            });

            if (isAiRateLimitError(error)) {
                await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
                throw new UnrecoverableError(errorMessage);
            }

            const maxAttempts = job.opts.attempts ?? 1;
            if (job.attemptsMade + 1 >= maxAttempts) {
                await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
            }

            throw error;
        }
    }
}
