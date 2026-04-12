import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VocabConflictBySubjectQuery {
    @ApiProperty({
        description: 'Subject ID to check conflicts for',
        example: 'cmcvuc64d00002dtxq5tkcl27',
    })
    @IsString()
    public readonly subjectId!: string;
}
