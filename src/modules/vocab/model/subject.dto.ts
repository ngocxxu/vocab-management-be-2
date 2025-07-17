import { ApiProperty } from '@nestjs/swagger';
import { Subject } from '@prisma/client';

export class SubjectDto {
    @ApiProperty({ description: 'Unique identifier for the subject' })
    public id: string;

    @ApiProperty({ description: 'Name of the subject', example: 'Greetings' })
    public name: string;

    @ApiProperty({ description: 'Display order', example: 1 })
    public order: number;

    @ApiProperty({ description: 'User ID', example: '1' })
    public userId: string;

    @ApiProperty({ description: 'Date when the subject was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the subject was last updated' })
    public readonly updatedAt: Date;

    public constructor(entity: Subject) {
        this.id = entity.id;
        this.name = entity.name;
        this.order = entity.order;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
