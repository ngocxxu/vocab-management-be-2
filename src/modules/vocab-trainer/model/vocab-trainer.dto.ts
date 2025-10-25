import { ApiProperty } from '@nestjs/swagger';
import {
    TrainerStatus,
    VocabTrainer,
    VocabTrainerWord,
    VocabTrainerResult,
    QuestionType,
} from '@prisma/client';
import { JsonValue } from '@prisma/client/runtime/library';
import { shuffleArray } from '../util';
import { FlipCardQuestionDto } from './flip-card-question.dto';
import { MultipleChoiceQuestionDto } from './multiple-choice-question.dto';
import { VocabTrainerResultDto } from './vocab-trainer-result.dto';
import { VocabTrainerWordDto } from './vocab-trainer-word.dto';

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

    @ApiProperty({ description: 'User ID', example: 'string' })
    public userId: string;

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

    @ApiProperty({
        description: 'AI-generated questions for this trainer',
        type: [MultipleChoiceQuestionDto, FlipCardQuestionDto],
        required: false,
    })
    public questionAnswers?: (MultipleChoiceQuestionDto | FlipCardQuestionDto)[];

    public constructor(
        entity: VocabTrainer & {
            vocabAssignments?: VocabTrainerWord[];
            results?: VocabTrainerResult[];
            questionAnswers?: JsonValue[];
        },
    ) {
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
        this.userId = entity.userId;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.vocabAssignments = entity.vocabAssignments?.map((a) => new VocabTrainerWordDto(a));
        this.results = entity.results?.map((r) => new VocabTrainerResultDto(r));
        this.questionAnswers = shuffleArray(
            entity.questionAnswers?.map((q) =>
                (q as { type: string } | null)?.type === QuestionType.MULTIPLE_CHOICE
                    ? new MultipleChoiceQuestionDto(q as unknown as MultipleChoiceQuestionDto)
                    : new FlipCardQuestionDto(q as unknown as FlipCardQuestionDto),
            ) ?? [],
        );
    }
}
