import { ApiProperty } from '@nestjs/swagger';
import { Subject } from '@prisma/client';

export class SubjectDto {
    @ApiProperty({ description: 'Unique identifier for the subject' })
    public readonly id: string;

    @ApiProperty({ description: 'Name of the subject', example: 'Mathematics' })
    public readonly name: string;

    @ApiProperty({ description: 'Display order of the subject', example: 1 })
    public readonly order: number;

    @ApiProperty({ description: 'Date when the subject was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the subject was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({ description: 'User ID', example: 'string' })
    public readonly userId: string;

    public constructor(entity: Subject) {
        this.id = entity.id;
        this.name = entity.name;
        this.order = entity.order;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.userId = entity.userId;
    }
}
