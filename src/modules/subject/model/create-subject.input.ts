import { ApiProperty, PickType } from '@nestjs/swagger';
import { SubjectDto } from './subject.dto';

export class CreateSubjectInput extends PickType(SubjectDto, ['name'] as const) {
    @ApiProperty({
        description: 'Name of the subject',
        example: 'Game',
        maxLength: 100,
    })
    public readonly name: string;

    @ApiProperty({
        description: 'User ID',
        example: 'string',
    })
    public readonly userId: string;
}
