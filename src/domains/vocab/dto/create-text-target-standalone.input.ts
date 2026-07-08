import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateVocabExampleInput } from './vocab.input';

export class CreateTextTargetStandaloneInput {
    @ApiProperty({ description: 'ID of the word type', required: false })
    @IsOptional()
    @IsString()
    public wordTypeId?: string;

    @ApiProperty({ description: 'Target text (translation/definition)', example: 'Hello' })
    @IsString()
    @IsNotEmpty()
    public textTarget: string;

    @ApiProperty({ description: 'Grammar information', example: 'interjection', required: false })
    @IsOptional()
    @IsString()
    public grammar?: string;

    @ApiProperty({ description: 'Explanation in source language', required: false })
    @IsOptional()
    @IsString()
    public explanationSource?: string;

    @ApiProperty({ description: 'Explanation in target language', required: false })
    @IsOptional()
    @IsString()
    public explanationTarget?: string;

    @ApiProperty({ description: 'List of subject ids', type: [String], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public readonly subjectIds?: string[];

    @ApiProperty({
        description: 'List of vocab examples',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateVocabExampleInput)
    public readonly vocabExamples?: CreateVocabExampleInput[];
}
