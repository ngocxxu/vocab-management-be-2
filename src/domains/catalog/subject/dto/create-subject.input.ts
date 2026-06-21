import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { SubjectDto } from './subject.dto';

export class CreateSubjectInput extends PickType(SubjectDto, ['name'] as const) {
    @ApiProperty({ description: 'Target language code for this subject', example: 'vi' })
    @IsString()
    @IsNotEmpty()
    public readonly targetLanguageCode: string;
}
