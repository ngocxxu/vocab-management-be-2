import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateRelatedWordInput {
    @ApiPropertyOptional({ description: 'Linked vocab identifier. Provide this or freeText.' })
    @IsOptional()
    @IsString()
    public readonly linkedVocabId?: string;

    @ApiPropertyOptional({ description: 'Free-text relation value. Provide this or linkedVocabId.' })
    @IsOptional()
    @IsString()
    public readonly freeText?: string;

    @ApiProperty({ description: 'Mark relation as synonym' })
    @IsBoolean()
    public readonly isSynonym: boolean;

    @ApiProperty({ description: 'Mark relation as antonym' })
    @IsBoolean()
    public readonly isAntonym: boolean;

    @ApiProperty({ description: 'Mark relation as related' })
    @IsBoolean()
    public readonly isRelated: boolean;
}

export class UpsertRelatedWordsInput {
    @ApiProperty({ type: () => [CreateRelatedWordInput] })
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => CreateRelatedWordInput)
    public readonly words: CreateRelatedWordInput[];
}
