import { ApiProperty, PickType } from '@nestjs/swagger';
import { WordTypeDto } from './word-type.data';

export class WordTypeInput extends PickType(WordTypeDto, ['name', 'description'] as const) {
    @ApiProperty({
        description: 'Name of the word type',
        example: 'Noun',
        maxLength: 100,
    })
    public readonly name: string;

    @ApiProperty({
        description: 'Description of the word type',
        example: 'A word used to identify any of a class of people, places, or things',
        maxLength: 500,
    })
    public readonly description: string;
}
