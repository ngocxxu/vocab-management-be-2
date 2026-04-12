import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

// Cho phép empty string và read-only fields từ DB
export class UpdateVocabExampleInput {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public id?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public textTargetId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public source?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public target?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    public createdAt?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    public updatedAt?: string;
}

export class UpdateTextTargetInput {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public id?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public wordTypeId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public textTarget?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public grammar?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public explanationSource?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public explanationTarget?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public subjectIds?: string[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateVocabExampleInput)
    public vocabExamples?: UpdateVocabExampleInput[];
}

export class VocabUpdateInput {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public textSource?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public sourceLanguageCode?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public targetLanguageCode?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    public languageFolderId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateTextTargetInput)
    public textTargets?: UpdateTextTargetInput[];
}
