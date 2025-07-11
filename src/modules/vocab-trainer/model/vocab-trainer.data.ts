import { ApiProperty } from '@nestjs/swagger';
import { TrainerStatus, VocabTrainer } from '@prisma/client';

export class VocabTrainerDto {
    @ApiProperty({ description: 'Unique identifier for the vocab trainer' })
    public id: string;

    @ApiProperty({ description: 'Name of the vocab trainer' })
    public name: string;

    @ApiProperty({ description: 'Status of the trainer' })
    public status: TrainerStatus;

    @ApiProperty({ description: 'Duration of the trainer' })
    public duration: number;

    @ApiProperty({ description: 'Count time' })
    public countTime: number;

    @ApiProperty({ description: 'Set count time' })
    public setCountTime: number;

    @ApiProperty({ description: 'Reminder disabled' })
    public reminderDisabled: boolean;

    @ApiProperty({ description: 'Reminder repeat' })
    public reminderRepeat: number;

    @ApiProperty({ description: 'Last reminder date' })
    public reminderLastRemind: Date;

    @ApiProperty({ description: 'Created at' })
    public createdAt: Date;

    @ApiProperty({ description: 'Updated at' })
    public updatedAt: Date;

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