import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { CategoryDto } from './category.data';

export class CategoryInput extends PickType(CategoryDto, ['name'] as const) {
    @ApiPropertyOptional({
        description: 'Array of product IDs to assign to this category',
        example: [1, 2, 3],
    })
    public readonly productIds?: number[];
}
