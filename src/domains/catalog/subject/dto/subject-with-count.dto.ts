import { ApiProperty } from '@nestjs/swagger';
import { Subject } from '@prisma/client';
import { IsInt, Min } from 'class-validator';
import { SubjectDto } from './subject.dto';

export class SubjectWithCountDto extends SubjectDto {
    @ApiProperty({ description: 'Number of distinct vocabs tagged with this subject', example: 12 })
    @IsInt()
    @Min(0)
    public readonly vocabCount: number;

    public constructor(entity: Subject, vocabCount: number) {
        super(entity);
        this.vocabCount = vocabCount;
    }
}
