import { Injectable, Logger } from '@nestjs/common';
import { NotificationAction, NotificationType, PriorityLevel } from '@prisma/client';
import { SSEService } from './sse.service';

export interface NotificationEvent {
    type: 'notification';
    notificationId: string;
    notificationType: NotificationType;
    action: NotificationAction;
    priority: PriorityLevel;
    data: Record<string, unknown>;
    timestamp: string;
    userId: string;
}

@Injectable()
export class SSEPublisherService {
    private readonly logger = new Logger(SSEPublisherService.name);

    public constructor(private readonly sseService: SSEService) {}

    /**
     * Publish a notification event to specific users
     * @param notificationId - The notification ID
     * @param notificationType - The type of notification
     * @param action - The notification action
     * @param priority - The notification priority
     * @param data - The notification data
     * @param recipientUserIds - Array of user IDs to send the notification to
     */
    public publishNotification(
        notificationId: string,
        notificationType: NotificationType,
        action: NotificationAction,
        priority: PriorityLevel,
        data: Record<string, unknown>,
        recipientUserIds: string[],
    ): void {
        const event: NotificationEvent = {
            type: 'notification',
            notificationId,
            notificationType,
            action,
            priority,
            data,
            timestamp: new Date().toISOString(),
            userId: '', // Will be set per user
        };

        // Send to each recipient
        recipientUserIds.forEach(userId => {
            const userEvent = {
                ...event,
                userId,
            };

            const success = this.sseService.sendToUser(userId, userEvent);
            if (success) {
                this.logger.log(`Notification ${notificationId} sent to user ${userId}`);
            } else {
                this.logger.warn(`Failed to send notification ${notificationId} to user ${userId} - user not connected`);
            }
        });
    }

    /**
     * Publish a system event to all connected users
     * @param eventType - The type of system event
     * @param data - The event data
     */
    public publishSystemEvent(eventType: string, data: Record<string, unknown>): void {
        const event = {
            type: 'system',
            eventType,
            data,
            timestamp: new Date().toISOString(),
        };

        this.sseService.broadcast(event);
        this.logger.log(`System event '${eventType}' broadcasted to all connected users`);
    }

    /**
     * Publish a custom event to specific users
     * @param eventType - The type of event
     * @param data - The event data
     * @param userIds - Array of user IDs to send the event to
     */
    public publishCustomEvent(
        eventType: string,
        data: Record<string, unknown>,
        userIds: string[],
    ): void {
        const event = {
            type: 'custom',
            eventType,
            data,
            timestamp: new Date().toISOString(),
        };

        this.sseService.sendToUsers(userIds, event);
        this.logger.log(`Custom event '${eventType}' sent to ${userIds.length} users`);
    }

    /**
     * Get connection statistics
     */
    public getConnectionStats(): { totalConnections: number; connectedUsers: string[] } {
        return {
            totalConnections: this.sseService.getConnectionCount(),
            connectedUsers: this.sseService.getConnectedUsers(),
        };
    }

    /**
     * Clean up dead connections
     */
    public cleanupConnections(): void {
        this.sseService.cleanupDeadConnections();
    }
}