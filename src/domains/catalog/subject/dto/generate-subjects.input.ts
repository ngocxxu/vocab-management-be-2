import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateSubjectsInput {
    @ApiProperty({ description: 'Translated word or phrase to generate subject suggestions for', example: 'con báo' })
    @IsString()
    @IsNotEmpty()
    public readonly textTarget: string;

    @ApiProperty({ description: 'Target language code', example: 'vi' })
    @IsString()
    @IsNotEmpty()
    public readonly targetLanguageCode: string;
}
