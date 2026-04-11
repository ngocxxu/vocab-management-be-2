import { ApiProperty } from '@nestjs/swagger';
import { NotificationAction, NotificationType, PriorityLevel } from '@prisma/client';

export class SSENotificationEventDto {
    @ApiProperty({ description: 'Event type', example: 'notification' })
    public readonly type: string;

    @ApiProperty({ description: 'Notification ID', example: 'clxxx1' })
    public readonly notificationId: string;

    @ApiProperty({
        description: 'Notification type',
        enum: NotificationType,
        example: NotificationType.VOCAB_TRAINER,
    })
    public readonly notificationType: NotificationType;

    @ApiProperty({
        description: 'Notification action',
        enum: NotificationAction,
        example: NotificationAction.CREATE,
    })
    public readonly action: NotificationAction;

    @ApiProperty({
        description: 'Notification priority',
        enum: PriorityLevel,
        example: PriorityLevel.LOW,
    })
    public readonly priority: PriorityLevel;

    @ApiProperty({ description: 'Notification data' })
    public readonly data: Record<string, unknown>;

    @ApiProperty({ description: 'Event timestamp', example: '2024-01-01T00:00:00.000Z' })
    public readonly timestamp: string;

    @ApiProperty({ description: 'User ID', example: 'clxxx1' })
    public readonly userId: string;
}