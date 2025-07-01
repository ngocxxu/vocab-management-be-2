import { ApiProperty } from '@nestjs/swagger';
import { NotificationRecipient, User } from '@prisma/client';
import { UserDto } from '../../user/model';

export class NotificationRecipientDto {
    @ApiProperty({ description: 'Unique identifier for the notification recipient' })
    public readonly id: string;

    @ApiProperty({ description: 'ID of the notification' })
    public readonly notificationId: string;

    @ApiProperty({ description: 'ID of the recipient user' })
    public readonly userId: string;

    @ApiProperty({ description: 'User details', required: false })
    public readonly user?: UserDto;

    @ApiProperty({ description: 'Whether the notification has been read' })
    public readonly isRead: boolean;

    @ApiProperty({ description: 'Whether the notification has been deleted by user' })
    public readonly isDeleted: boolean;

    @ApiProperty({ description: 'Date when the recipient assignment was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the recipient assignment was last updated' })
    public readonly updatedAt: Date;

    public constructor(entity: NotificationRecipient & { user?: User }) {
        this.id = entity.id;
        this.notificationId = entity.notificationId;
        this.userId = entity.userId;
        this.user = entity.user ? new UserDto(entity.user) : undefined;
        this.isRead = entity.isRead;
        this.isDeleted = entity.isDeleted;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
