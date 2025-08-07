import { ApiProperty } from '@nestjs/swagger';
import { UserFcmToken } from '@prisma/client';

export class FcmTokenDto {
    @ApiProperty({ description: 'User ID', example: 'user-uuid' })
    public readonly userId: string;

    @ApiProperty({ description: 'FCM token', example: 'fcm_token_string_here' })
    public readonly fcmToken: string;

    @ApiProperty({ description: 'Device type', example: 'web', required: false })
    public readonly deviceType?: string;

    @ApiProperty({ description: 'Token active status', example: true })
    public readonly isActive: boolean;

    @ApiProperty({ description: 'Token creation date', example: '2024-01-01T00:00:00.000Z' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Token last update date', example: '2024-01-01T00:00:00.000Z' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'Token deletion date',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
    })
    public readonly deletedAt?: Date;

    public constructor(entity: UserFcmToken) {
        this.userId = entity.userId;
        this.fcmToken = entity.fcmToken;
        this.deviceType = entity.deviceType ?? undefined;
        this.isActive = entity.isActive;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.deletedAt = entity.deletedAt ?? undefined;
    }
}
