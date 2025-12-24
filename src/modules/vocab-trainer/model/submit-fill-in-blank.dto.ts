import { ApiProperty } from '@nestjs/swagger';
import { SubmitExamInput } from './submit-exam.dto';

export interface WordTestInput {
    userAnswer: string;
    systemAnswer: string;
}

export class SubmitFillInBlankInput extends SubmitExamInput {
    @ApiProperty({
        description: 'User answers for fill-in-blank questions',
        type: [Object],
        example: [
            {
                userAnswer: 'Xin chào',
                systemAnswer: 'Xin chào',
            },
        ],
    })
    public wordTestInputs: WordTestInput[];
}
