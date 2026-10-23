import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { MultipleChoiceGenerationJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bull';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { EReminderType } from '../../reminder/utils';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { AiService } from '../services/ai.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { classifyAiJobFailure, StaleAiJobError, withAiCallTimeout } from '../utils/ai-job.util';

@Injectable()
@Processor(EReminderType.MULTIPLE_CHOICE_GENERATION)
export class MultipleChoiceGenerationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly vocabTrainerJobLockService: VocabTrainerJobLockService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
    ) {}

    @Process({
        name: 'generate-questions',
        concurrency: QUEUE_CONFIG[EReminderType.MULTIPLE_CHOICE_GENERATION].concurrency,
    })
    public async processMultipleChoiceGeneration(job: Job<MultipleChoiceGenerationJobData>): Promise<object> {
        const { vocabTrainerId, vocabList, userId, lockToken } = job.data;
        const jobId = String(job.id ?? '');

        try {
            const ownsLock = await this.vocabTrainerJobLockService.isOwner(userId, String(jobId), lockToken);
            if (!ownsLock) {
                this.logger.warn(`Skipping stale multiple choice generation job ${jobId} for user ${userId}`);
                throw new StaleAiJobError(jobId, userId);
            }

            await this.vocabTrainerJobLockService.refreshLock(userId, lockToken, job.attemptsMade);
            this.logger.info(`Processing multiple choice generation job ${job.id} for user ${userId}`);

            this.notificationGateway.emitMultipleChoiceGenerationProgress(userId, jobId, 'generating');

            const questions = await withAiCallTimeout(this.aiService.generateMultipleChoiceQuestions(vocabList, userId), 'Multiple choice generation');

            await this.vocabTrainerRepository.updateVocabTrainerFields(vocabTrainerId, {
                questionAnswers: questions.map((question) => ({
                    correctAnswer: question.correctAnswer,
                    type: question.type,
                    content: question.content,
                    options: question.options.map((option) => ({
                        label: option.label,
                        value: option.value,
                    })),
                })),
            });

            // Also stored by Bull as the job's return value, which the job-status endpoint serves.
            const completed = { questions };
            this.notificationGateway.emitMultipleChoiceGenerationProgress(userId, jobId, 'completed', completed);
            await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);

            this.logger.info(`Multiple choice generation job ${job.id} completed successfully`);
            return completed;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Multiple choice generation job ${job.id} failed: ${errorMessage}`);

            const { permanent, finalAttempt } = classifyAiJobFailure(job, error);
            if (finalAttempt) {
                this.notificationGateway.emitMultipleChoiceGenerationProgress(userId, jobId, 'failed', { error: errorMessage });
                await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);
            } else {
                this.notificationGateway.emitMultipleChoiceGenerationProgress(userId, jobId, 'generating');
            }
            if (permanent) {
                await job.discard();
            }

            throw error;
        }
    }
}
