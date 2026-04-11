import { ApiProperty } from '@nestjs/swagger';
import { Subject, TextTargetSubject } from '@prisma/client';
import { SubjectDto } from '.';
export class TextTargetSubjectDto {
    @ApiProperty({ description: 'Unique identifier for the subject assignment' })
    public id: string;

    @ApiProperty({ description: 'ID of the text target' })
    public textTargetId: string;

    @ApiProperty({ description: 'ID of the subject' })
    public subjectId: string;

    @ApiProperty({ description: 'Date when the assignment was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the assignment was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'Subject details',
        required: false,
    })
    public readonly subject?: SubjectDto;

    public constructor(
        entity: TextTargetSubject & {
            subject?: Subject;
        },
    ) {
        this.id = entity.id;
        this.textTargetId = entity.textTargetId;
        this.subjectId = entity.subjectId;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.subject = entity.subject ? new SubjectDto(entity.subject) : undefined;
    }
}
