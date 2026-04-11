import { ApiProperty, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { SubjectDto } from './subject.dto';

export class SubjectInput extends PickType(SubjectDto, ['name', 'order'] as const) {
    @ApiProperty({
        description: 'Name of the subject',
        example: 'Mathematics',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public readonly name: string;

    @ApiProperty({
        description: 'Display order of the subject',
        example: 1,
        minimum: 0,
    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public readonly order: number;
}
