import { ApiProperty, PickType } from '@nestjs/swagger';
import { SubjectDto } from './subject.data';

export class CreateSubjectInput extends PickType(SubjectDto, ['name'] as const) {
    @ApiProperty({
        description: 'Name of the subject',
        example: 'Mathematics',
        maxLength: 100,
    })
    public readonly name: string;
}
