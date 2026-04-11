import type { SendFcmNotificationJobData } from '@/queues/interfaces/job-payloads';
import { NotificationFcmProducer } from '@/queues/producers/notification-fcm.producer';
import { LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationFcmService {
    public constructor(
        private readonly notificationFcmProducer: NotificationFcmProducer,
        private readonly logger: LoggerService,
    ) {}

    public async queuePushNotification(
        notificationId: string,
        userIds: string[],
        title: string,
        body: string,
        data?: Record<string, string>,
        priority: 'normal' | 'high' = 'normal',
        delay?: number,
    ): Promise<void> {
        try {
            const jobData: SendFcmNotificationJobData = {
                notificationId,
                userIds,
                title,
                body,
                data,
                priority,
            };

            await this.notificationFcmProducer.sendNotification(jobData, delay !== undefined ? { delay } : undefined);

            this.logger.info(`Queued FCM notification for notification ${notificationId} to ${userIds.length} users`);
        } catch (error) {
            this.logger.error(`Failed to queue FCM notification: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    public async sendImmediatePushNotification(
        notificationId: string,
        userIds: string[],
        title: string,
        body: string,
        data?: Record<string, string>,
        priority: 'normal' | 'high' = 'normal',
    ): Promise<void> {
        return this.queuePushNotification(notificationId, userIds, title, body, data, priority);
    }

    public async sendDelayedPushNotification(
        notificationId: string,
        userIds: string[],
        title: string,
        body: string,
        delayMs: number,
        data?: Record<string, string>,
        priority: 'normal' | 'high' = 'normal',
    ): Promise<void> {
        return this.queuePushNotification(notificationId, userIds, title, body, data, priority, delayMs);
    }

    public async getQueueStats(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    }> {
        try {
            return await this.notificationFcmProducer.getQueueStats();
        } catch (error) {
            this.logger.error(`Failed to get queue stats: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    public async clearQueue(): Promise<void> {
        try {
            await this.notificationFcmProducer.drain();
            this.logger.info('FCM notification queue cleared');
        } catch (error) {
            this.logger.error(`Failed to clear queue: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
