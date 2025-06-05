import { ApiProperty } from '@nestjs/swagger';
import { Category } from '@prisma/client';

export class CategoryData {
    @ApiProperty({ description: 'Category unique ID', example: 1 })
    public readonly id: number;

    @ApiProperty({ description: 'Category name', example: 'Bracelet' })
    public readonly name: string;

    public constructor(entity: Category) {
        this.id = entity.id;
        this.name = entity.name;
    }
}
