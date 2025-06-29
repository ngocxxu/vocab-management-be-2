import { ApiProperty } from '@nestjs/swagger';
import { VocabTrainer } from '@prisma/client';

export class VocabTrainerDto {
    @ApiProperty({ description: 'Unique identifier for the vocabulary trainer' })
    public id: string;

    @ApiProperty({ description: 'Name of the trainer', example: 'Daily English Practice' })
    public name: string;

    @ApiProperty({
        description: 'Current status of the trainer',
        enum: ['PENDING', 'IN_PROCESS', 'COMPLETED', 'CANCELLED', 'FAILED', 'PASSED'],
    })
    public status: string;

    @ApiProperty({ description: 'Duration in minutes', example: 30 })
    public duration: number;

    @ApiProperty({ description: 'Current count time', example: 0 })
    public countTime: number;

    @ApiProperty({ description: 'Set count time', example: 0 })
    public setCountTime: number;

    @ApiProperty({ description: 'Whether reminder is disabled', example: false })
    public reminderDisabled: boolean;

    @ApiProperty({ description: 'Reminder repeat count', example: 2 })
    public reminderRepeat: number;

    @ApiProperty({ description: 'Last reminder date' })
    public reminderLastRemind: Date;

    @ApiProperty({ description: 'Date when the trainer was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the trainer was last updated' })
    public readonly updatedAt: Date;

    public constructor(entity: VocabTrainer) {
        this.id = entity.id;
        this.name = entity.name;
        this.status = entity.status;
        this.duration = entity.duration;
        this.countTime = entity.countTime;
        this.setCountTime = entity.setCountTime;
        this.reminderDisabled = entity.reminderDisabled;
        this.reminderRepeat = entity.reminderRepeat;
        this.reminderLastRemind = entity.reminderLastRemind;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
