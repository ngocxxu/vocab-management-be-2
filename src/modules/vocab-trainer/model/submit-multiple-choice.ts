import { ApiProperty } from '@nestjs/swagger';
import { SubmitExamInput } from './submit-exam';

export class SubmitMultipleChoiceInput extends SubmitExamInput {
    @ApiProperty({
        description: 'IDs of vocabs which user choose to exam',
        type: [Object],
        example: [
            {
                vocabId: 'string',
                userSelect: 'string',
            },
        ],
    })
    public wordTestSelects: {
        vocabId: string;
        userSelect: string;
    }[];
}
