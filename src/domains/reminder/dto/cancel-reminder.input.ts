import { ApiProperty } from '@nestjs/swagger';

export class CancelReminderInput {
    @ApiProperty({ description: 'Job ID', example: '1', required: true })
    public readonly jobId: string;
}