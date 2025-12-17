import { ApiProperty } from '@nestjs/swagger';

export class FillInBlankQuestionDto {
    @ApiProperty({ description: 'Correct answer', example: 'Xin chào' })
    public correctAnswer: string;

    @ApiProperty({ description: 'Type of question', enum: ['textSource', 'textTarget'] })
    public type: 'textSource' | 'textTarget';

    @ApiProperty({
        description: 'Question content with blank',
        example: 'What is the translation of "Hello" in Vietnamese?',
    })
    public content: string;

    public constructor(entity: FillInBlankQuestionDto) {
        this.correctAnswer = entity.correctAnswer;
        this.type = entity.type;
        this.content = entity.content;
    }
}












