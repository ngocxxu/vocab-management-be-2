// eslint-disable-next-line max-classes-per-file
import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { NotificationAction, NotificationType, PriorityLevel, UserRole } from '@prisma/client';
import { InputJsonValue, JsonValue } from '@prisma/client/runtime/library';
import { Type } from 'class-transformer';
import { Allow, IsArray, IsBoolean, IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationDto } from './notification.dto';

export class NotificationInput extends PickType(NotificationDto, ['type', 'action', 'priority', 'isActive', 'expiresAt'] as const) {
    @ApiProperty({ description: 'Notification data as JSON object' })
    @Allow()
    public readonly data: InputJsonValue;

    @ApiProperty({
        description: 'Date when the notification expires',
        example: '2024-12-31T23:59:59Z',
    })
    @Type(() => Date)
    @IsDate()
    public readonly expiresAt: Date;

    @ApiProperty({
        description: 'List of recipient user IDs',
        type: [String],
        example: ['clxxx1', 'clxxx2', 'clxxx3'],
    })
    @IsArray()
    @IsString({ each: true })
    public readonly recipientUserIds: string[];
}

export class UpdateNotificationInput extends PartialType(PickType(NotificationDto, ['type', 'action', 'priority', 'data', 'isActive', 'expiresAt'] as const)) {}

export class UpdateNotificationStatusInput {
    @ApiProperty({
        description: 'Whether the notification has been read',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isRead?: boolean;

    @ApiProperty({
        description: 'Whether the notification has been deleted by user',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isDeleted?: boolean;
}

export class BulkNotificationInput {
    @ApiProperty({
        description: 'List of user IDs to send notification to',
        type: [String],
        example: ['clxxx1', 'clxxx2', 'clxxx3'],
    })
    @IsArray()
    @IsString({ each: true })
    public readonly userIds: string[];

    @ApiProperty({
        description: 'Type of notification',
        enum: ['SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY'],
        example: 'SYSTEM',
    })
    @IsEnum(NotificationType)
    public readonly type: NotificationType;

    @ApiProperty({
        description: 'Action that triggered the notification',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO'],
        example: 'INFO',
    })
    @IsEnum(NotificationAction)
    public readonly action: NotificationAction;

    @ApiProperty({
        description: 'Priority level of the notification',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        example: 'MEDIUM',
    })
    @IsEnum(PriorityLevel)
    public readonly priority: PriorityLevel;

    @ApiProperty({
        description: 'Notification data as JSON object',
        example: {
            title: 'System Maintenance',
            message: 'System will be under maintenance from 2AM to 4AM',
            url: '/maintenance',
        },
    })
    @Allow()
    public readonly data: JsonValue;

    @ApiProperty({
        description: 'Date when the notification expires',
        example: '2024-12-31T23:59:59Z',
    })
    @Type(() => Date)
    @IsDate()
    public readonly expiresAt: Date;
}

export class NotificationFilterInput {
    @ApiProperty({
        description: 'Filter by notification type',
        enum: ['SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY'],
        required: false,
    })
    @IsOptional()
    @IsEnum(NotificationType)
    public readonly type?: NotificationType;

    @ApiProperty({
        description: 'Filter by notification action',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO'],
        required: false,
    })
    @IsOptional()
    @IsEnum(NotificationAction)
    public readonly action?: NotificationAction;

    @ApiProperty({
        description: 'Filter by priority level',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        required: false,
    })
    @IsOptional()
    @IsEnum(PriorityLevel)
    public readonly priority?: PriorityLevel;

    @ApiProperty({
        description: 'Filter by active status',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isActive?: boolean;

    @ApiProperty({
        description: 'Filter by read status',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isRead?: boolean;

    @ApiProperty({
        description: 'Filter by deleted status',
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isDeleted?: boolean;

    @ApiProperty({
        description: 'Filter notifications created after this date',
        required: false,
    })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public readonly createdAfter?: Date;

    @ApiProperty({
        description: 'Filter notifications created before this date',
        required: false,
    })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public readonly createdBefore?: Date;

    @ApiProperty({
        description: 'Filter notifications expiring after this date',
        required: false,
    })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public readonly expiresAfter?: Date;

    @ApiProperty({
        description: 'Filter notifications expiring before this date',
        required: false,
    })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public readonly expiresBefore?: Date;
}

export class SendNotificationToRoleInput {
    @ApiProperty({
        description: 'User role to send notification to',
        enum: ['ADMIN', 'MEMBER', 'GUEST'],
        example: 'MEMBER',
    })
    @IsEnum(UserRole)
    public readonly role: UserRole;

    @ApiProperty({
        description: 'Type of notification',
        enum: ['SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY'],
        example: 'MARKETING',
    })
    @IsEnum(NotificationType)
    public readonly type: NotificationType;

    @ApiProperty({
        description: 'Action that triggered the notification',
        enum: ['CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO'],
        example: 'INFO',
    })
    @IsEnum(NotificationAction)
    public readonly action: NotificationAction;

    @ApiProperty({
        description: 'Priority level of the notification',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        example: 'LOW',
    })
    @IsEnum(PriorityLevel)
    public readonly priority: PriorityLevel;

    @ApiProperty({
        description: 'Notification data as JSON object',
        example: {
            title: 'New Feature Available',
            message: 'Check out our new feature in the dashboard!',
            url: '/features/new',
        },
    })
    @Allow()
    public readonly data: JsonValue;

    @ApiProperty({
        description: 'Date when the notification expires',
        example: '2024-12-31T23:59:59Z',
    })
    @Type(() => Date)
    @IsDate()
    public readonly expiresAt: Date;

    @ApiProperty({
        description: 'Only send to active users',
        default: true,
        required: false,
    })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public readonly activeUsersOnly?: boolean;
}
