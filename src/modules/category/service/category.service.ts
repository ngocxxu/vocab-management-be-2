import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { CategoryData, CategoryInput } from '../model';

@Injectable()
export class CategoryService {
    // Custom error mapping cho Category
    private readonly categoryErrorMapping = {
        P2002: 'Category name already exists',
        P2025: {
            update: 'Category not found',
            delete: 'Category not found',
            findOne: 'Category not found',
            create: 'One or more products not found',
            find: 'Category not found',
        },
    };

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all categories in the database
     */
    public async find(): Promise<CategoryData[]> {
        try {
            const categories = await this.prismaService.category.findMany({
                include: {
                    products: true,
                },
            });

            return categories.map((category) => new CategoryData({ ...category }));
        } catch (error) {
            PrismaErrorHandler.handle(error, 'find', this.categoryErrorMapping);
        }
    }

    /**
     * Find a single category by ID
     */
    public async findOne(id: number): Promise<CategoryData> {
        try {
            const category = await this.prismaService.category.findUnique({
                where: { id },
                include: {
                    products: true,
                },
            });

            if (!category) {
                throw new NotFoundException(`Category with ID ${id} not found`);
            }

            return new CategoryData({ ...category });
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.categoryErrorMapping);
        }
    }

    /**
     * Create a new category record
     */
    public async create(input: CategoryInput): Promise<CategoryData> {
        try {
            const category = await this.prismaService.category.create({
                data: {
                    name: input.name,
                    slug: input.name.toLowerCase().replace(/\s+/g, '-'),
                    ...(input.productIds &&
                        input.productIds.length > 0 && {
                            products: {
                                connect: input.productIds.map((id) => ({ id })),
                            },
                        }),
                },
                include: {
                    products: true,
                },
            });

            return new CategoryData({ ...category });
        } catch (error) {
            PrismaErrorHandler.handle(error, 'create', this.categoryErrorMapping);
        }
    }
    /**
     * Update a category record
     */
    public async update(id: number, input: CategoryInput): Promise<CategoryData> {
        try {
            const category = await this.prismaService.category.update({
                where: { id },
                data: {
                    name: input.name,
                    ...(input.productIds !== undefined && {
                        products: {
                            set: input.productIds.map((productId) => ({ id: productId })),
                        },
                    }),
                },
                include: {
                    products: true,
                },
            });

            return new CategoryData({ ...category });
        } catch (error) {
            PrismaErrorHandler.handle(error, 'update', this.categoryErrorMapping);
        }
    }

    /**
     * Delete a category from the database
     */
    public async delete(id: number): Promise<CategoryData> {
        try {
            const category = await this.prismaService.category.delete({
                where: { id },
                include: {
                    products: true,
                },
            });

            return new CategoryData({ ...category });
        } catch (error) {
            PrismaErrorHandler.handle(error, 'delete', this.categoryErrorMapping);
        }
    }
}
