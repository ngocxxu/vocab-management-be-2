import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CancelReminderInput {
    @ApiProperty({ description: 'Job ID', example: '1', required: true })
    @IsString()
    @IsNotEmpty()
    public readonly jobId: string;
}
