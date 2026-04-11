import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { ENotificationFcmType, EReminderType } from '@/domains/reminder/utils';
import { QUEUE_CONFIG } from '../config/queue.config';
import type { SendFcmNotificationJobData } from '../interfaces/job-payloads';
import { BaseProducer } from './base.producer';

@Injectable()
export class NotificationFcmProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.NOTIFICATION_FCM) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.NOTIFICATION_FCM].defaultJobOptions);
    }

    public sendNotification(
        data: SendFcmNotificationJobData,
        opts?: JobsOptions,
    ): Promise<{ jobId: string }> {
        return this.addJob(ENotificationFcmType.SEND_NOTIFICATION, data, opts);
    }

    public async getQueueStats(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    }> {
        const [waiting, active, completed, failed] = await Promise.all([
            this.queue.getWaiting(),
            this.queue.getActive(),
            this.queue.getCompleted(),
            this.queue.getFailed(),
        ]);
        return {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
        };
    }

    public drain(): Promise<void> {
        return this.queue.drain();
    }
}
