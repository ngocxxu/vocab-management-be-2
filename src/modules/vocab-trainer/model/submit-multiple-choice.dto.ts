import { ApiProperty } from '@nestjs/swagger';
import { WordTestSelect } from '../util/type.util';
import { SubmitExamInput } from './submit-exam.dto';

export class SubmitMultipleChoiceInput extends SubmitExamInput {
    @ApiProperty({
        description: 'IDs of vocabs which user choose to exam',
        type: [Object],
        example: [
            {
                systemSelected: 'string',
                userSelected: 'string',
            },
        ],
    })
    public wordTestSelects: WordTestSelect[];
}
