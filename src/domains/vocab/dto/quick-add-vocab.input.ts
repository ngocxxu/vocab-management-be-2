import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class QuickAddVocabInput {
    @ApiProperty({ description: 'Source text to add. Language pair and folder come from the API key used to authenticate.', example: 'serendipity' })
    @IsString()
    @IsNotEmpty()
    public readonly textSource: string;
}
