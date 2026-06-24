import { AiService } from '@/domains/ai/services/ai.service';
import { NotificationGateway } from '@/domains/platform/events/gateway/notification.gateway';
import { EReminderType } from '@/domains/reminder/utils';
import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import { JOB_NAMES } from '@/queues/constants/queue.constants';
import type { VocabGenerateTextTargetJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

@Injectable()
@Processor(EReminderType.VOCAB_GENERATE_TEXT_TARGET)
export class VocabGenerateTextTargetProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly notificationGateway: NotificationGateway,
    ) {}

    @Process({
        name: JOB_NAMES.generateTextTarget,
        concurrency: QUEUE_CONFIG[EReminderType.VOCAB_GENERATE_TEXT_TARGET].concurrency,
    })
    public async processVocabGenerateTextTarget(job: Job<VocabGenerateTextTargetJobData>): Promise<void> {
        const { textSource, sourceLanguageCode, targetLanguageCode, userId } = job.data;
        const jobId = job.id ?? '';

        const result = await this.aiService.translateVocab(textSource, sourceLanguageCode, targetLanguageCode, undefined, userId);
        this.notificationGateway.emitVocabGenerateTextTargetResult(userId, jobId, textSource, result);
        this.logger.info(`VocabGenerateTextTarget job ${jobId} completed for user ${userId}`);
    }
}
