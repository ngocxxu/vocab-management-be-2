import { ApiProperty } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';

export class SubmitExamInput {
    @ApiProperty({ description: 'Type of questions for this trainer', example: QuestionType.MULTIPLE_CHOICE, enum: QuestionType })
    public questionType: QuestionType;

    @ApiProperty({ description: 'Count time', example: 300 })
    public countTime?: number;
}