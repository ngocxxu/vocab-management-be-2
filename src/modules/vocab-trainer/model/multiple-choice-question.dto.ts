import { ApiProperty } from '@nestjs/swagger';

export class MultipleChoiceQuestionDto {
    @ApiProperty({ description: 'Correct answer label', example: 'A' })
    public correctAnswer: string;

    @ApiProperty({ description: 'Type of question', enum: ['textSource', 'textTarget'] })
    public type: 'textSource' | 'textTarget';

    @ApiProperty({
        description: 'Question content',
        example: 'What is the translation of "Hello" in Vietnamese?',
    })
    public content: string;

    @ApiProperty({
        description: 'Answer options',
        type: 'array',
        items: {
            type: 'object',
            properties: {
                label: { type: 'string', example: 'A' },
                value: { type: 'string', example: 'Xin chào' },
            },
        },
    })
    public options: Array<{
        label: string;
        value: string;
    }>;

    public constructor(entity: MultipleChoiceQuestionDto) {
        this.correctAnswer = entity.correctAnswer;
        this.type = entity.type;
        this.content = entity.content;
        this.options = entity.options;
    }
}
