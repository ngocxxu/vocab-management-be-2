import { ApiProperty } from '@nestjs/swagger';
import { QuestionType, TrainerStatus } from '@prisma/client';
import { QueryParamsInput } from '../../common/model/query-params.input';

export class VocabTrainerQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Name of the vocab trainer' })
    public name: string;

    @ApiProperty({ description: 'Status of the trainer', enum: TrainerStatus })
    public status: TrainerStatus;

    @ApiProperty({ description: 'Type of questions for this trainer', enum: QuestionType })
    public questionType: QuestionType;
}