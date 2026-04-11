import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
    @ApiProperty({
        description: 'Notification title',
        example: 'Test Notification',
    })
    public readonly title: string;

    @ApiProperty({
        description: 'Notification body',
        example: 'This is a test notification',
    })
    public readonly body: string;

    @ApiProperty({
        description: 'Additional data to send with notification',
        example: { key: 'value' },
        required: false,
    })
    public readonly data?: Record<string, string>;

    @ApiProperty({
        description: 'Notification image URL',
        example: 'https://example.com/image.jpg',
        required: false,
    })
    public readonly imageUrl?: string;

    @ApiProperty({
        description: 'Notification priority',
        example: 'high',
        required: false,
    })
    public readonly priority?: 'normal' | 'high';
}
