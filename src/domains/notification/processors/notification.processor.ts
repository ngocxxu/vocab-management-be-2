import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { NotificationAction, NotificationType, PriorityLevel } from '@prisma/client';
import { Job } from 'bullmq';
import { EEmailReminderType, EReminderType, EXPIRES_AT_30_DAYS } from '../../reminder/utils';
import { NotificationService } from '../services';
import { NotificationJobData } from '../utils';

@Processor(EReminderType.NOTIFICATION)
export class NotificationProcessor {
    public constructor(
        private readonly notificationService: NotificationService,
        private readonly logger: LoggerService,
    ) {}

    @Process({
        name: EEmailReminderType.SEND_CREATE_NOTIFICATION,
        concurrency: QUEUE_CONFIG[EReminderType.NOTIFICATION].concurrency,
    })
    public async handleCreateNotification(job: Job<NotificationJobData>) {
        const { reminderType, data, recipientUserIds } = job.data;

        try {
            await this.notificationService.create({
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                priority: PriorityLevel.LOW,
                expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                isActive: true,
                recipientUserIds,
                data,
            });

            // // Publish notification event via SSE
            // this.ssePublisher.publishCustomEvent(
            //   SSE_EVENT_TYPES.NOTIFICATION_CREATED,
            //   {
            //     id: notification.id,
            //     type: notification.type,
            //     action: notification.action,
            //     priority: notification.priority,
            //     data: notification.data,
            //     timestamp: notification.createdAt.toISOString(),
            //   },
            //   recipientUserIds,
            // );

            this.logger.info(`Notification sent successfully to ${recipientUserIds.join(', ')} with reminder type: ${reminderType}`);
        } catch (error) {
            this.logger.error(`Failed to send notification: ${error}`);
            throw error;
        }
    }
}
