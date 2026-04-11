import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';

export class WordTestSelectItem {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public systemSelected: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public userSelected: string;
}

export class WordTestBlankItem {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public userAnswer: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public systemAnswer: string;
}

export class SubmitExamInput {
    @ApiProperty({ description: 'Type of questions for this trainer', example: QuestionType.MULTIPLE_CHOICE, enum: QuestionType })
    @IsEnum(QuestionType)
    public questionType: QuestionType;

    @ApiProperty({ description: 'Count time', example: 300, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public countTime?: number;
}

export class SubmitExamBodyInput extends SubmitExamInput {
    @ApiPropertyOptional({
        description: 'IDs of vocabs which user choose to exam (multiple choice)',
        type: [WordTestSelectItem],
    })
    @ValidateIf((o: SubmitExamBodyInput) => o.questionType === QuestionType.MULTIPLE_CHOICE)
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => WordTestSelectItem)
    public wordTestSelects?: WordTestSelectItem[];

    @ApiPropertyOptional({
        description: 'User answers for fill-in-blank questions',
        type: [WordTestBlankItem],
    })
    @ValidateIf((o: SubmitExamBodyInput) => o.questionType === QuestionType.FILL_IN_THE_BLANK)
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => WordTestBlankItem)
    public wordTestInputs?: WordTestBlankItem[];

    @ApiPropertyOptional({ description: 'Cloudinary fileId (publicId)', required: false })
    @ValidateIf((o: SubmitExamBodyInput) => o.questionType === QuestionType.TRANSLATION_AUDIO)
    @IsString()
    @IsNotEmpty()
    public fileId?: string;

    @ApiPropertyOptional({ description: 'Target style (optional)', required: false })
    @ValidateIf((o: SubmitExamBodyInput) => o.questionType === QuestionType.TRANSLATION_AUDIO)
    @IsOptional()
    @IsIn(['formal', 'informal'])
    public targetStyle?: 'formal' | 'informal';

    @ApiPropertyOptional({ description: 'Target audience (optional)', required: false })
    @ValidateIf((o: SubmitExamBodyInput) => o.questionType === QuestionType.TRANSLATION_AUDIO)
    @IsOptional()
    @IsString()
    public targetAudience?: string;
}
