import { ApiProperty } from '@nestjs/swagger';
import { TrainerStatus } from '@prisma/client';

export class VocabTrainerInput {
    @ApiProperty({ description: 'Name of the vocab trainer' })
    public name: string;

    @ApiProperty({ description: 'Status of the trainer', enum: TrainerStatus })
    public status: TrainerStatus;

    @ApiProperty({ description: 'Duration of the trainer', required: false })
    public duration?: number;

    @ApiProperty({ description: 'Count time', required: false })
    public countTime?: number;

    @ApiProperty({ description: 'Set count time', required: false })
    public setCountTime?: number;

    @ApiProperty({ description: 'Reminder disabled', required: false })
    public reminderDisabled?: boolean;

    @ApiProperty({ description: 'Reminder repeat', required: false })
    public reminderRepeat?: number;

    @ApiProperty({ description: 'Last reminder date', required: false })
    public reminderLastRemind?: Date;
}