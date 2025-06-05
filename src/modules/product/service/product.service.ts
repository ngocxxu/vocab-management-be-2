import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common';
import { ProductData, ProductInput } from '../model';

@Injectable()
export class ProductService {
    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all products in the database
     *
     * @returns A product list
     */
    public async find(): Promise<ProductData[]> {
        const products = await this.prismaService.product.findMany({
            include: {
                images: true,
                attributes: true,
                category: true,
            },
        });

        return products.map(
            (product) =>
                new ProductData({ ...product, attributes: product.attributes || undefined }),
        );
    }

    /**
     * Find a single product by ID
     *
     * @param id Product ID to find
     * @returns The product if found
     * @throws NotFoundException if product doesn't exist
     */
    public async findOne(id: number): Promise<ProductData> {
        const product = await this.prismaService.product.findUnique({
            where: { id },
            include: {
                images: true,
                attributes: true,
                category: true,
            },
        });

        if (!product) {
            throw new NotFoundException(`Product with ID ${id} not found`);
        }

        return new ProductData({
            ...product,
            attributes: product.attributes || undefined,
        });
    }

    /**
     * Create a new product record
     *
     * @param data Product details
     * @returns A product created in the database
     */
    public async create(data: ProductInput): Promise<ProductData> {
        try {
            const product = await this.prismaService.product.create({
                data: {
                    name: data.name,
                    description: data.description,
                    price: data.price,
                    stock: data.stock,
                    mainImage: data.mainImage,
                    categoryId: data.categoryId ?? null,
                    attributes: data.attributes
                        ? {
                              create: {
                                  material: data.attributes.material,
                                  brand: data.attributes.brand,
                                  origin: data.attributes.origin ?? null,
                                  sizes: data.attributes.sizes ?? Prisma.JsonNull,
                              },
                          }
                        : undefined,
                    images: data.images?.length
                        ? {
                              create: data.images.map((url) => ({
                                  url,
                              })),
                          }
                        : undefined,
                },
                include: {
                    images: true,
                    attributes: true,
                    category: true,
                },
            });

            return new ProductData({
                ...product,
                attributes: product.attributes ?? undefined,
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    throw new ConflictException('Product already exists');
                }
            }
            throw error;
        }
    }

    public async update(id: number, data: ProductInput): Promise<ProductData> {
        const product = await this.prismaService.product.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                price: data.price,
                stock: data.stock,
                mainImage: data.mainImage,
                categoryId: data.categoryId ?? null,
                attributes: data.attributes
                    ? {
                          upsert: {
                              create: {
                                  material: data.attributes.material,
                                  brand: data.attributes.brand,
                                  origin: data.attributes.origin ?? null,
                                  sizes: data.attributes.sizes ?? Prisma.JsonNull,
                              },
                              update: {
                                  material: data.attributes.material,
                                  brand: data.attributes.brand,
                                  origin: data.attributes.origin ?? null,
                                  sizes: data.attributes.sizes ?? Prisma.JsonNull,
                              },
                          },
                      }
                    : undefined,
                images: data.images?.length
                    ? {
                          deleteMany: {}, // Delete old images before adding new ones
                          create: data.images.map((url) => ({
                              url,
                          })),
                      }
                    : undefined,
            },
            include: {
                images: true,
                attributes: true,
                category: true,
            },
        });

        return new ProductData({
            ...product,
            attributes: product.attributes || undefined,
        });
    }

    /**
     * Delete a product from the database
     *
     * @param id Product ID to delete
     * @returns The deleted product
     * @throws NotFoundException if product doesn't exist
     */
    public async delete(id: number): Promise<ProductData> {
        const product = await this.prismaService.product.delete({
            where: { id },
            include: {
                images: true,
                attributes: true,
                category: true,
            },
        });

        return new ProductData({
            ...product,
            attributes: product.attributes || undefined,
        });
    }
}
