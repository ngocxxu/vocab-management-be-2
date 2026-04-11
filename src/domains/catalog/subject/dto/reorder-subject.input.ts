import { ApiProperty } from '@nestjs/swagger';

export class ReorderSubjectInput {
    @ApiProperty({
        description: 'Subject IDs to reorder',
        example: [
            { id: '1', order: 1 },
            { id: '2', order: 2 },
        ],
    })
    public readonly subjectIds: { id: string; order: number }[];
}
