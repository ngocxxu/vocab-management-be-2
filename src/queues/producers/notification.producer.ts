import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { EEmailReminderType, EReminderType } from '@/domains/reminder/utils';
import { QUEUE_CONFIG } from '../config/queue.config';
import type { NotificationJobData } from '../interfaces/job-payloads';
import { BaseProducer } from './base.producer';

@Injectable()
export class NotificationProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.NOTIFICATION) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.NOTIFICATION].defaultJobOptions);
    }

    public sendCreateNotification(
        data: NotificationJobData,
        opts?: JobsOptions,
    ): Promise<{ jobId: string }> {
        return this.addJob(EEmailReminderType.SEND_CREATE_NOTIFICATION, data, opts);
    }
}
