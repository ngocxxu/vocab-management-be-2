import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';

export class ReorderSubjectItemInput {
    @ApiProperty({ description: 'Subject id', example: 'clxxx1' })
    @IsString()
    @IsNotEmpty()
    public readonly id: string;

    @ApiProperty({ description: 'Display order', example: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public readonly order: number;
}

export class ReorderSubjectInput {
    @ApiProperty({
        description: 'Subject IDs to reorder',
        example: [
            { id: '1', order: 1 },
            { id: '2', order: 2 },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReorderSubjectItemInput)
    public readonly subjectIds: ReorderSubjectItemInput[];
}
