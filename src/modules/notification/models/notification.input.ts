// eslint-disable-next-line max-classes-per-file
import { ApiProperty, PickType } from '@nestjs/swagger';
import { InputJsonValue, JsonValue } from '@prisma/client/runtime/library';
import { NotificationDto } from './notification.dto';

export class NotificationInput extends PickType(NotificationDto, [
    'type',
    'action',
    'priority',
    'isActive',
    'expiresAt',
] as const) {
    @ApiProperty({ description: 'Notification data as JSON object' })
    public readonly data: InputJsonValue;

    @ApiProperty({
        description: 'Date when the notification expires',
        example: '2024-12-31T23:59:59Z',
    })
    public readonly expiresAt: Date;

    @ApiProperty({
        description: 'List of recipient user IDs',
        type: [String],
        example: ['clxxx1', 'clxxx2', 'clxxx3'],
    })
    public readonly recipientUserIds: string[];
}

export class UpdateNotificationInput extends PickType(NotificationDto, [
    'type',
    'action',
    'priority',
    'data',
    'isActive',
    'expiresAt',
] as const) {
    @ApiProperty({
        description: 'Notification data as JSON object',
        example: {
            title: 'Updated Title',
            message: 'Updated message',
            url: '/new-dashboard',
        },
        required: false,
    })
    public readonly data: JsonValue;
}

export class UpdateNotificationStatusInput {
    @ApiProperty({
        description: 'Whether the notification has been read',
        required: false,
    })
    public readonly isRead?: boolean;

    @ApiProperty({
        description: 'Whether the notification has been deleted by user',
        required: false,
    })
    public readonly isDeleted?: boolean;
}

export class BulkNotificationInput {
    @ApiProperty({
        description: 'List of user IDs to send notification to',
        type: [String],
        example: ['clxxx1', 'clxxx2', 'clxxx3'],
    })
    public readonly userIds: string[];

    @ApiProperty({
        description: 'Type of notification',
        enum: ['SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY'],
        example: 'SYSTEM',
    })
    public readonly type: string;

    @ApiProperty({
        description: 'Action that triggered the notification',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO'],
        example: 'INFO',
    })
    public readonly action: string;

    @ApiProperty({
        description: 'Priority level of the notification',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        example: 'MEDIUM',
    })
    public readonly priority: string;

    @ApiProperty({
        description: 'Notification data as JSON object',
        example: {
            title: 'System Maintenance',
            message: 'System will be under maintenance from 2AM to 4AM',
            url: '/maintenance',
        },
    })
    public readonly data: JsonValue;

    @ApiProperty({
        description: 'Date when the notification expires',
        example: '2024-12-31T23:59:59Z',
    })
    public readonly expiresAt: Date;
}

export class NotificationFilterInput {
    @ApiProperty({
        description: 'Filter by notification type',
        enum: ['SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY'],
        required: false,
    })
    public readonly type?: string;

    @ApiProperty({
        description: 'Filter by notification action',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO'],
        required: false,
    })
    public readonly action?: string;

    @ApiProperty({
        description: 'Filter by priority level',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        required: false,
    })
    public readonly priority?: string;

    @ApiProperty({
        description: 'Filter by active status',
        required: false,
    })
    public readonly isActive?: boolean;

    @ApiProperty({
        description: 'Filter by read status',
        required: false,
    })
    public readonly isRead?: boolean;

    @ApiProperty({
        description: 'Filter by deleted status',
        required: false,
    })
    public readonly isDeleted?: boolean;

    @ApiProperty({
        description: 'Filter notifications created after this date',
        required: false,
    })
    public readonly createdAfter?: Date;

    @ApiProperty({
        description: 'Filter notifications created before this date',
        required: false,
    })
    public readonly createdBefore?: Date;

    @ApiProperty({
        description: 'Filter notifications expiring after this date',
        required: false,
    })
    public readonly expiresAfter?: Date;

    @ApiProperty({
        description: 'Filter notifications expiring before this date',
        required: false,
    })
    public readonly expiresBefore?: Date;
}

export class SendNotificationToRoleInput {
    @ApiProperty({
        description: 'User role to send notification to',
        enum: ['ADMIN', 'MEMBER', 'GUEST'],
        example: 'MEMBER',
    })
    public readonly role: string;

    @ApiProperty({
        description: 'Type of notification',
        enum: ['SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY'],
        example: 'MARKETING',
    })
    public readonly type: string;

    @ApiProperty({
        description: 'Action that triggered the notification',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO'],
        example: 'INFO',
    })
    public readonly action: string;

    @ApiProperty({
        description: 'Priority level of the notification',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        example: 'LOW',
    })
    public readonly priority: string;

    @ApiProperty({
        description: 'Notification data as JSON object',
        example: {
            title: 'New Feature Available',
            message: 'Check out our new feature in the dashboard!',
            url: '/features/new',
        },
    })
    public readonly data: JsonValue;

    @ApiProperty({
        description: 'Date when the notification expires',
        example: '2024-12-31T23:59:59Z',
    })
    public readonly expiresAt: Date;

    @ApiProperty({
        description: 'Only send to active users',
        default: true,
        required: false,
    })
    public readonly activeUsersOnly?: boolean;
}
