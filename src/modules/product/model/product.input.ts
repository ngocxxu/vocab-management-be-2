import { PickType } from '@nestjs/swagger';
import { ProductData } from './product.data';

export class ProductInput extends PickType(ProductData, [
    'name',
    'description',
    'price',
    'stock',
    'mainImage',
    'categoryId',
    'attributes',
    'images',
] as const) {}
