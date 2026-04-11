import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

export class NotificationDto {
    @ApiProperty({
        description: 'Notification title',
        example: 'Test Notification',
    })
    @IsString()
    @IsNotEmpty()
    public readonly title: string;

    @ApiProperty({
        description: 'Notification body',
        example: 'This is a test notification',
    })
    @IsString()
    @IsNotEmpty()
    public readonly body: string;

    @ApiProperty({
        description: 'Additional data to send with notification',
        example: { key: 'value' },
        required: false,
    })
    @IsOptional()
    @IsObject()
    public readonly data?: Record<string, string>;

    @ApiProperty({
        description: 'Notification image URL',
        example: 'https://example.com/image.jpg',
        required: false,
    })
    @IsOptional()
    @IsUrl()
    public readonly imageUrl?: string;

    @ApiProperty({
        description: 'Notification priority',
        example: 'high',
        required: false,
    })
    @IsOptional()
    @IsIn(['normal', 'high'])
    public readonly priority?: 'normal' | 'high';
}
