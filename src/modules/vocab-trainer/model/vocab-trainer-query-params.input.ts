import { ApiProperty } from '@nestjs/swagger';
import { QuestionType, TrainerStatus } from '@prisma/client';
import { QueryParamsInput } from '../../common/model/query-params.input';

export class VocabTrainerQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Name of the vocab trainer', required: false })
    public name: string;

    @ApiProperty({ description: 'Status of the trainer', example: TrainerStatus.PENDING, enum: TrainerStatus, required: false })
    public status: TrainerStatus;

    @ApiProperty({ description: 'Type of questions for this trainer', example: QuestionType.MULTIPLE_CHOICE, enum: QuestionType, required: false })
    public questionType: QuestionType;

    @ApiProperty({ description: 'User ID', example: '1', required: false })
    public readonly userId: string;
}