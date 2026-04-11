import { ApiProperty } from '@nestjs/swagger';
import { Subject } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class SubjectDto {
    @ApiProperty({ description: 'Unique identifier for the subject' })
    public readonly id: string;

    @ApiProperty({ description: 'Name of the subject', example: 'Game' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public readonly name: string;

    @ApiProperty({ description: 'Display order of the subject', example: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
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
