import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CsvImportQueryDto {
    @ApiProperty({ description: 'Language folder ID', example: 'cmcw657mf0000hczy22gs0lmg' })
    @IsString()
    @IsNotEmpty()
    public readonly languageFolderId: string;

    @ApiProperty({ description: 'Source language code', example: 'en' })
    @IsString()
    @IsNotEmpty()
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Target language code', example: 'vi' })
    @IsString()
    @IsNotEmpty()
    public readonly targetLanguageCode: string;
}
