import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CsvRowDto {
    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Hello' })
    @IsString()
    @IsNotEmpty()
    public readonly textSource: string;

    @ApiProperty({ description: 'Target text (translation/definition)', example: 'Xin chào' })
    @IsString()
    @IsNotEmpty()
    public readonly textTarget: string;

    @ApiProperty({ description: 'Word type name', example: 'Noun', required: false })
    @IsString()
    @IsOptional()
    public readonly wordType?: string;

    @ApiProperty({ description: 'Grammar information', example: 'N/A', required: false })
    @IsString()
    @IsOptional()
    public readonly grammar?: string;

    @ApiProperty({
        description: 'Explanation in source language',
        example: 'A greeting',
        required: false,
    })
    @IsString()
    @IsOptional()
    public readonly explanationSource?: string;

    @ApiProperty({
        description: 'Explanation in target language',
        example: 'Lời chào',
        required: false,
    })
    @IsString()
    @IsOptional()
    public readonly explanationTarget?: string;

    @ApiProperty({
        description: 'Subject names (comma-separated)',
        example: 'Daily,Sport',
        required: false,
    })
    @IsString()
    @IsOptional()
    public readonly subjects?: string;

    @ApiProperty({ description: 'Example source text', example: 'Hello world!', required: false })
    @IsString()
    @IsOptional()
    public readonly exampleSource?: string;

    @ApiProperty({
        description: 'Example target text',
        example: 'Xin chào thế giới!',
        required: false,
    })
    @IsString()
    @IsOptional()
    public readonly exampleTarget?: string;
}
