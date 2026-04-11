import { PickType } from '@nestjs/swagger';
import { SubjectDto } from './subject.dto';

export class CreateSubjectInput extends PickType(SubjectDto, ['name'] as const) {
}
