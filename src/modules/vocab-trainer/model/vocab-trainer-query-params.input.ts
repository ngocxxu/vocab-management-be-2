import { ApiProperty } from '@nestjs/swagger';
import { QuestionType, TrainerStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsArray } from 'class-validator';
import { QueryParamsInput } from '../../common/model/query-params.input';

export class VocabTrainerQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Name of the vocab trainer', required: false })
    @IsOptional()
    public name: string;

    @ApiProperty({
        description: 'Status of the trainer (single value or comma-separated array)',
        example: ['PENDING', 'PASSED', 'FAILED'],
        required: false,
        oneOf: [
            { type: 'string', enum: Object.values(TrainerStatus) },
            { type: 'array', items: { type: 'string', enum: Object.values(TrainerStatus) } },
        ],
    })
    @IsOptional()
    @Transform(({ value }: { value: string | string[] | undefined }) => {
        if (typeof value === 'string') {
            return value.split(',').map((s) => s.trim());
        }
        return value;
    })
    @IsArray()
    public status: TrainerStatus[];

    @ApiProperty({
        description: 'Type of questions for this trainer',
        example: QuestionType.MULTIPLE_CHOICE,
        enum: QuestionType,
        required: false,
    })
    @IsOptional()
    public questionType: QuestionType;

    @ApiProperty({ description: 'User ID', example: 'string', required: false })
    @IsOptional()
    public readonly userId: string;
}
