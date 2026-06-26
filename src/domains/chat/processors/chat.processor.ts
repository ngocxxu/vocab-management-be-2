import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import { JOB_NAMES } from '@/queues/constants/queue.constants';
import type { AiChatJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService, RedisPubSubService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { EReminderType } from '../../reminder/utils';
import { CHAT_CHANNELS } from '../constants';

@Processor(EReminderType.AI_CHAT)
export class ChatProcessor {
    public constructor(
        private readonly redisPubSub: RedisPubSubService,
        private readonly logger: LoggerService,
    ) {}

    @Process({
        name: JOB_NAMES.aiChat,
        concurrency: QUEUE_CONFIG[EReminderType.AI_CHAT].concurrency,
    })
    public async handleChatJob(job: Job<AiChatJobData>): Promise<void> {
        const { userId, messageId } = job.data;
        this.logger.info(`Processing chat job: jobId=${job.id} userId=${userId} messageId=${messageId}`);

        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), {
            content: 'Hello! I am your AI assistant. (stub response)',
            messageId,
        });

        this.logger.info(`Chat job completed: jobId=${job.id} userId=${userId}`);
    }
}
