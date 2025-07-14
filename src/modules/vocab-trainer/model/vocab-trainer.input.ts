import { ApiProperty } from '@nestjs/swagger';
import { TrainerStatus } from '@prisma/client';

export class VocabTrainerInput {
    @ApiProperty({ description: 'Name of the vocab trainer' })
    public name: string;

    @ApiProperty({ description: 'Status of the trainer', enum: TrainerStatus })
    public status: TrainerStatus;

    @ApiProperty({ description: 'reminderTime of the trainer', required: false })
    public reminderTime?: number;

    @ApiProperty({ description: 'Count time', required: false })
    public countTime?: number;

    @ApiProperty({ description: 'Set count time', required: false, example: 300 })
    public setCountTime?: number;

    @ApiProperty({ description: 'Reminder disabled', required: false })
    public reminderDisabled?: boolean;

    @ApiProperty({ description: 'Reminder repeat', required: false, example: 2 })
    public reminderRepeat?: number;

    @ApiProperty({ description: 'Last reminder date', required: false })
    public reminderLastRemind?: Date;

    @ApiProperty({ description: 'IDs of vocabs to assign to this trainer', required: false, type: [String] })
    public vocabAssignmentIds?: string[];
}