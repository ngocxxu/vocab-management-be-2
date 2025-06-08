import { PickType } from '@nestjs/swagger';
import { ProductDto } from './product.data';

export class ProductInput extends PickType(ProductDto, [
    'name',
    'description',
    'price',
    'stock',
    'mainImage',
    'categoryId',
    'attributes',
    'images',
] as const) {}
