import { ApiProperty } from '@nestjs/swagger';

export class SSECustomEventDto {
    @ApiProperty({ description: 'Event type', example: 'custom' })
    public readonly type: string;

    @ApiProperty({ description: 'Custom event type', example: 'user_activity' })
    public readonly eventType: string;

    @ApiProperty({ description: 'Event data' })
    public readonly data: Record<string, unknown>;

    @ApiProperty({ description: 'Event timestamp', example: '2024-01-01T00:00:00.000Z' })
    public readonly timestamp: string;
}