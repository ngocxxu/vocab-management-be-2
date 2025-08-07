import { OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { FirebaseService } from '../../../firebase';
import { LoggerService } from '../../common';
import { FcmService } from '../../fcm/service';

export interface NotificationFcmJob {
    notificationId: string;
    userIds: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
    priority?: 'normal' | 'high';
}

@Injectable()
@Processor('notification-fcm')
export class NotificationFcmProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly fcmService: FcmService,
        private readonly firebaseService: FirebaseService,
    ) {}

    @Process('send-notification')
    public async sendNotification(job: Job<NotificationFcmJob>): Promise<void> {
        const { notificationId, userIds, title, body, data, priority } = job.data;

        try {
            this.logger.info(
                `Processing FCM notification job ${job.id} for notification ${notificationId}`,
            );

            // Get FCM tokens for all users
            const tokens = await this.fcmService.getTokensForUsers(userIds);

            if (tokens.length === 0) {
                this.logger.warn(`No FCM tokens found for users: ${userIds.join(', ')}`);
                return;
            }

            const fcmTokens = tokens.map((token) => token.fcmToken);

            // Send push notification
            const response = await this.firebaseService.sendToMultipleDevices(
                fcmTokens,
                {
                    title,
                    body,
                    data: {
                        notificationId,
                        ...data,
                    },
                },
                {
                    priority: priority || 'normal',
                },
            );

            this.logger.info(
                `FCM notification sent for notification ${notificationId}: ` +
                    `${response.successCount} success, ${response.failureCount} failed`,
            );

            // Log failed tokens for cleanup
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        this.logger.error(
                            `Failed to send FCM notification to token ${fcmTokens[idx]}: ${resp.error?.message}`,
                        );
                    }
                });
            }
        } catch (error) {
            this.logger.error(
                `Failed to process FCM notification job ${job.id}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    @OnQueueActive()
    public onActive(job: Job): void {
        this.logger.info(`Processing FCM notification job ${job.id}`);
    }

    @OnQueueCompleted()
    public onComplete(job: Job): void {
        this.logger.info(`FCM notification job ${job.id} completed successfully`);
    }

    @OnQueueFailed()
    public onError(job: Job, error: Error): void {
        this.logger.error(`FCM notification job ${job.id} failed: ${error.message}`);
    }
}
