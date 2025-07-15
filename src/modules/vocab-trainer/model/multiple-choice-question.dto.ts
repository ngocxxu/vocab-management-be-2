import { ApiProperty } from '@nestjs/swagger';

export class MultipleChoiceQuestionDto  {
    @ApiProperty({ description: 'Type of question', required: false, type: String })
    public type?: string;

    @ApiProperty({ description: 'Content of question', required: false, type: String })
    public content?: string[];

    @ApiProperty({ description: 'Options of question', required: false, type: [String] })
    public options?: { label: string; value: string }[];

    public constructor(entity: MultipleChoiceQuestionDto) {
        this.type = entity.type;
        this.content = entity.content;
        this.options = entity.options;
    }
}