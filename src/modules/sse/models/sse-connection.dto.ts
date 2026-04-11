import { ApiProperty } from '@nestjs/swagger';

export class SSEConnectionEventDto {
    @ApiProperty({ description: 'Event type', example: 'connection' })
    public readonly type: string;

    @ApiProperty({ description: 'Connection message', example: 'SSE connection established' })
    public readonly message: string;

    @ApiProperty({ description: 'User ID', example: 'clxxx1' })
    public readonly userId: string;

    @ApiProperty({ description: 'Event timestamp', example: '2024-01-01T00:00:00.000Z' })
    public readonly timestamp: string;
}