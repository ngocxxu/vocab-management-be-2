import { ApiProperty, PickType } from '@nestjs/swagger';
import { LanguageDto } from './language.dto';

export class LanguageInput extends PickType(LanguageDto, ['code', 'name'] as const) {
    @ApiProperty({
        description: 'Language code in ISO format',
        example: 'en-US',
        pattern: '^[a-z]{2,3}(-[A-Z]{2})?$',
    })
    public readonly code: string;

    @ApiProperty({
        description: 'Display name of the language',
        example: 'English (United States)',
        maxLength: 100,
    })
    public readonly name: string;
}
