import { ApiProperty } from '@nestjs/swagger';
import { QuestionType, TrainerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class VocabTrainerInput {
    @ApiProperty({ description: 'Name of the vocab trainer', example: 'Vocab Trainer 1' })
    @IsString()
    @IsNotEmpty()
    public name: string;

    @ApiProperty({
        description: 'Status of the trainer',
        example: TrainerStatus.PENDING,
        enum: TrainerStatus,
    })
    @IsEnum(TrainerStatus)
    public status: TrainerStatus;

    @ApiProperty({
        description: 'Type of questions for this trainer',
        example: QuestionType.MULTIPLE_CHOICE,
        enum: QuestionType,
    })
    @IsEnum(QuestionType)
    public questionType: QuestionType;

    @ApiProperty({ description: 'reminderTime of the trainer', required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public reminderTime?: number;

    @ApiProperty({ description: 'Count time', required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public countTime?: number;

    @ApiProperty({ description: 'Set count time', required: false, example: 300 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public setCountTime?: number;

    @ApiProperty({ description: 'Reminder disabled', required: false })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public reminderDisabled?: boolean;

    @ApiProperty({ description: 'Reminder repeat', required: false, example: 2 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public reminderRepeat?: number;

    @ApiProperty({ description: 'Last reminder date', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public reminderLastRemind?: Date;

    @ApiProperty({
        description: 'IDs of vocabs to assign to this trainer',
        required: false,
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public vocabAssignmentIds?: string[];
}
