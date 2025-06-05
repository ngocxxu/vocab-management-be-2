import { ApiProperty } from '@nestjs/swagger';
import { Product, ProductImage, ProductAttribute } from '@prisma/client';

export class ProductData {
    @ApiProperty({ description: 'Product unique ID', example: 1 })
    public readonly id: number;

    @ApiProperty({ description: 'Product name', example: 'Shark Jaw Bone' })
    public readonly name: string;

    @ApiProperty({ description: 'Product description', required: false })
    public readonly description?: string;

    @ApiProperty({ description: 'Product price', example: 999.99 })
    public readonly price: number;

    @ApiProperty({ description: 'Stock quantity', example: 10 })
    public readonly stock: number;

    @ApiProperty({ description: 'Main image URL' })
    public readonly mainImage: string;

    @ApiProperty({ description: 'Additional product images' })
    public readonly images: string[];

    @ApiProperty({ description: 'Category ID', required: false })
    public readonly categoryId?: number;

    @ApiProperty({
        description: 'Product attributes',
        required: false,
        example: {
            material: 'Silver',
            brand: 'BrandName',
            origin: 'Vietnam',
            sizes: ['S', 'M', 'L'],
        },
    })
    public readonly attributes?: ProductAttribute;

    @ApiProperty({ description: 'Created date' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Updated date' })
    public readonly updatedAt: Date;

    public constructor(
        entity: Product & {
            images: ProductImage[];
            attributes?: ProductAttribute;
        },
    ) {
        this.id = entity.id;
        this.name = entity.name;
        this.description = entity.description ?? undefined;
        this.price = entity.price;
        this.stock = entity.stock;
        this.mainImage = entity.mainImage;
        this.images = entity.images.map((img) => img.url);
        this.categoryId = entity.categoryId ?? undefined;
        this.attributes = entity.attributes
            ? {
                  id: entity.attributes.id,
                  material: entity.attributes.material,
                  brand: entity.attributes.brand,
                  origin: entity.attributes.origin,
                  sizes: entity.attributes.sizes,
                  productId: entity.attributes.productId,
              }
            : undefined;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
