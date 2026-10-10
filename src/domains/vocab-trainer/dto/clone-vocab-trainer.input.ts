import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const MAX_NAME_LENGTH = 200;

/** What the user chooses when starting a new cycle from an FSRS trainer. The words, directions and settings are copied. */
export class CloneVocabTrainerInput {
    @ApiProperty({ description: 'Name of the new trainer', example: 'Exam words, second round', maxLength: MAX_NAME_LENGTH })
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_NAME_LENGTH)
    public name: string;

    @ApiProperty({ description: 'End of the new cycle, must be in the future; null or missing = no end', required: false, nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    public endsAt?: Date | null;
}
