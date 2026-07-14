import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { FillInBlankChoiceGenerationJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { EReminderType } from '../../reminder/utils';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { AiService } from '../services/ai.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { isAiRateLimitError } from '../utils/ai-rate-limit.util';

@Injectable()
@Processor(EReminderType.FILL_IN_BLANK_CHOICE_GENERATION)
export class FillInBlankChoiceGenerationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly vocabTrainerJobLockService: VocabTrainerJobLockService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
    ) {}

    @Process({
        name: 'generate-fill-in-blank-choice',
        concurrency: QUEUE_CONFIG[EReminderType.FILL_IN_BLANK_CHOICE_GENERATION].concurrency,
    })
    public async processFillInBlankChoiceGeneration(job: Job<FillInBlankChoiceGenerationJobData>): Promise<void> {
        const { vocabTrainerId, vocabList, userId, lockToken } = job.data;
        const jobId = job.id || '';

        try {
            const ownsLock = await this.vocabTrainerJobLockService.isOwner(userId, String(jobId), lockToken);
            if (!ownsLock) {
                this.logger.warn(`Skipping stale fill-in-blank choice generation job ${jobId} for user ${userId}`);
                return;
            }

            await this.vocabTrainerJobLockService.refreshLock(userId, lockToken, job.attemptsMade);
            this.logger.info(`Processing fill-in-blank choice generation job ${job.id} for user ${userId}`);

            this.notificationGateway.emitFillInBlankChoiceGenerationProgress(userId, jobId, 'generating');

            const questions = await this.aiService.generateFillInBlankChoiceQuestions(vocabList, userId);

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

            this.notificationGateway.emitFillInBlankChoiceGenerationProgress(userId, jobId, 'completed', {
                questions,
            });
            await this.vocabTrainerJobLockService.releaseIfOwned(userId, lockToken);

            this.logger.info(`Fill-in-blank choice generation job ${job.id} completed successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Fill-in-blank choice generation job ${job.id} failed: ${errorMessage}`);

            this.notificationGateway.emitFillInBlankChoiceGenerationProgress(userId, jobId, 'failed', {
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
