import { ApiProperty } from '@nestjs/swagger';
import { Notification, NotificationAction, NotificationRecipient, NotificationType, PriorityLevel, User } from '@prisma/client';
import { JsonValue } from '@prisma/client/runtime/library';
import { Type } from 'class-transformer';
import { Allow, IsBoolean, IsDate, IsEnum } from 'class-validator';
import { NotificationRecipientDto } from '.';

export class NotificationDto {
    @ApiProperty({ description: 'Unique identifier for the notification' })
    public readonly id: string;

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
        example: 'CREATE',
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

    @ApiProperty({ description: 'Notification data as JSON object' })
    @Allow()
    public readonly data: JsonValue;

    @ApiProperty({ description: 'Whether the notification is active' })
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isActive: boolean;

    @ApiProperty({ description: 'Date when the notification expires' })
    @Type(() => Date)
    @IsDate()
    public readonly expiresAt: Date;

    @ApiProperty({ description: 'Date when the notification was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the notification was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'List of notification recipients',
        type: [NotificationRecipientDto],
        required: false,
    })
    public readonly recipients?: NotificationRecipientDto[];

    public constructor(
        entity: Notification & {
            notificationRecipients?: (NotificationRecipient & { user?: User })[];
        },
    ) {
        this.id = entity.id;
        this.type = entity.type;
        this.action = entity.action;
        this.priority = entity.priority;
        this.data = entity.data;
        this.isActive = entity.isActive;
        this.expiresAt = entity.expiresAt;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.recipients = entity.notificationRecipients?.map((recipient) => new NotificationRecipientDto(recipient));
    }
}
