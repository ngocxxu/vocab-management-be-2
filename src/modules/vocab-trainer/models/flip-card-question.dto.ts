import { ApiProperty } from '@nestjs/swagger';

export class FlipCardQuestionDto {
    @ApiProperty({
        description: 'Text content for the front side of the flip card',
        type: 'array',
        items: { type: 'string' },
        example: ['Hello', 'Hi'],
    })
    public frontText: string[];

    @ApiProperty({
        description: 'Text content for the back side of the flip card',
        type: 'array',
        items: { type: 'string' },
        example: ['Xin chào', 'Chào bạn'],
    })
    public backText: string[];

    @ApiProperty({
        description: 'Language code for the front side text',
        example: 'EN',
    })
    public frontLanguageCode: string;

    @ApiProperty({
        description: 'Language code for the back side text',
        example: 'VI',
    })
    public backLanguageCode: string;

    public constructor(data: {
        frontText: string[];
        backText: string[];
        frontLanguageCode: string;
        backLanguageCode: string;
    }) {
        this.frontText = data.frontText;
        this.backText = data.backText;
        this.frontLanguageCode = data.frontLanguageCode;
        this.backLanguageCode = data.backLanguageCode;
    }
}
