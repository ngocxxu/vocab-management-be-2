import { ApiProperty } from '@nestjs/swagger';
import { FsrsDirection, QuestionType, TrainerMode, TrainerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { FSRS_MAX_DESIRED_RETENTION, FSRS_MAX_INTERVAL_DAYS, FSRS_MIN_DESIRED_RETENTION } from '../utils/fsrs-trainer-rules';

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

    @ApiProperty({ description: 'Learning mode. Fixed after creation.', required: false, enum: TrainerMode, default: TrainerMode.CLASSIC })
    @IsOptional()
    @IsEnum(TrainerMode)
    public mode?: TrainerMode;

    @ApiProperty({ description: 'FSRS: target recall probability at review time', required: false, minimum: 0.7, maximum: 0.97, example: 0.9 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(FSRS_MIN_DESIRED_RETENTION)
    @Max(FSRS_MAX_DESIRED_RETENTION)
    public fsrsDesiredRetention?: number;

    @ApiProperty({ description: 'FSRS: longest gap between reviews, in days', required: false, minimum: 1, maximum: 36500, example: 365 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(FSRS_MAX_INTERVAL_DAYS)
    public fsrsMaximumInterval?: number;

    @ApiProperty({ description: 'FSRS: max new words introduced per day; null = unlimited', required: false, nullable: true, minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    public fsrsNewPerDay?: number | null;

    @ApiProperty({ description: 'FSRS: directions that get a card. Fixed after creation.', required: false, enum: FsrsDirection, isArray: true })
    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsEnum(FsrsDirection, { each: true })
    public fsrsDirections?: FsrsDirection[];

    @ApiProperty({ description: 'FSRS: end of the cycle (for example an exam date); null = no end', required: false, nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public fsrsEndsAt?: Date | null;
}
