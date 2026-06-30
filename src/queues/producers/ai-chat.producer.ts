import type { AiChatJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class AiChatProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.AI_CHAT) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.AI_CHAT].defaultJobOptions);
    }

    public async addChatJob(data: AiChatJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.aiChat, data, opts);
    }
}
