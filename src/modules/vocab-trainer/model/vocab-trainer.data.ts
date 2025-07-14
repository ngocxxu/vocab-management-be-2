import { ApiProperty } from '@nestjs/swagger';
import { TrainerStatus, VocabTrainer, VocabTrainerWord, VocabTrainerResult, QuestionType } from '@prisma/client';
import { VocabTrainerResultDto } from './vocab-trainer-result.data';
import { VocabTrainerWordDto } from './vocab-trainer-word.data';

export class VocabTrainerDto {
    @ApiProperty({ description: 'Unique identifier for the vocab trainer' })
    public id: string;

    @ApiProperty({ description: 'Name of the vocab trainer' })
    public name: string;

    @ApiProperty({ description: 'Status of the trainer' })
    public status: TrainerStatus;

    @ApiProperty({ description: 'Type of questions for this trainer', enum: QuestionType })
    public questionType: QuestionType;

    @ApiProperty({ description: 'Reminder time of the trainer' })
    public reminderTime: number;

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

    @ApiProperty({
        description: 'Assignments of vocabularies to this trainer',
        type: [VocabTrainerWordDto],
        required: false,
    })
    public vocabAssignments?: VocabTrainerWordDto[];

    @ApiProperty({
        description: 'Results for this trainer',
        type: [VocabTrainerResultDto],
        required: false,
    })
    public results?: VocabTrainerResultDto[];

    public constructor(entity: VocabTrainer & {
        vocabAssignments?: VocabTrainerWord[];
        results?: VocabTrainerResult[];
    }) {
        this.id = entity.id;
        this.name = entity.name;
        this.status = entity.status;
        this.questionType = entity.questionType;
        this.reminderTime = entity.reminderTime;
        this.countTime = entity.countTime;
        this.setCountTime = entity.setCountTime;
        this.reminderDisabled = entity.reminderDisabled;
        this.reminderRepeat = entity.reminderRepeat;
        this.reminderLastRemind = entity.reminderLastRemind;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.vocabAssignments = entity.vocabAssignments?.map(
            (a) => new VocabTrainerWordDto(a),
        );
        this.results = entity.results?.map((r) => new VocabTrainerResultDto(r));
    }
}