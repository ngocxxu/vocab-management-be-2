import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { LoggerService } from '../../common';
import { EReminderType } from '../../reminder/util';
import { NotificationFcmJob } from '../processor/notification-fcm.processor';

@Injectable()
export class NotificationFcmService {
    public constructor(
        @InjectQueue(EReminderType.NOTIFICATION_FCM) private readonly notificationFcmQueue: Queue,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Queue a push notification to be sent to multiple users
     */
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
            const jobData: NotificationFcmJob = {
                notificationId,
                userIds,
                title,
                body,
                data,
                priority,
            };

            const jobOptions: JobsOptions = {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            };

            if (delay) {
                jobOptions.delay = delay;
            }

            await this.notificationFcmQueue.add('send-notification', jobData, jobOptions);

            this.logger.info(
                `Queued FCM notification for notification ${notificationId} to ${userIds.length} users`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to queue FCM notification: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * Queue an immediate push notification
     */
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

    /**
     * Queue a delayed push notification
     */
    public async sendDelayedPushNotification(
        notificationId: string,
        userIds: string[],
        title: string,
        body: string,
        delayMs: number,
        data?: Record<string, string>,
        priority: 'normal' | 'high' = 'normal',
    ): Promise<void> {
        return this.queuePushNotification(
            notificationId,
            userIds,
            title,
            body,
            data,
            priority,
            delayMs,
        );
    }

    /**
     * Get queue statistics
     */
    public async getQueueStats(): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    }> {
        try {
            const [waiting, active, completed, failed] = await Promise.all([
                this.notificationFcmQueue.getWaiting(),
                this.notificationFcmQueue.getActive(),
                this.notificationFcmQueue.getCompleted(),
                this.notificationFcmQueue.getFailed(),
            ]);

            return {
                waiting: waiting.length,
                active: active.length,
                completed: completed.length,
                failed: failed.length,
            };
        } catch (error) {
            this.logger.error(
                `Failed to get queue stats: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * Clear all jobs from the queue
     */
    public async clearQueue(): Promise<void> {
        try {
            await this.notificationFcmQueue.drain();
            this.logger.info('FCM notification queue cleared');
        } catch (error) {
            this.logger.error(
                `Failed to clear queue: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        }
    }
}
