import { Injectable } from '@nestjs/common';
import { Plan, Prisma, UserRole } from '@prisma/client';
import { BaseRepository } from '../../../database';
import { PrismaService } from '../../shared';

@Injectable()
export class PlanRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async create(data: Prisma.PlanCreateInput): Promise<Plan> {
        return this.prisma.plan.create({ data });
    }

    public async updateByRole(
        role: UserRole,
        data: Prisma.PlanUpdateInput,
    ): Promise<Plan> {
        return this.prisma.plan.update({
            where: { role },
            data,
        });
    }

    public async findManyActive(role?: UserRole): Promise<
        Array<{
            role: UserRole;
            name: string;
            price: unknown;
            priceLabel: string;
            limits: unknown;
            features: unknown;
        }>
    > {
        return this.prisma.plan.findMany({
            where: { isActive: true, ...(role !== undefined && { role }) },
            orderBy: { sortOrder: 'asc' },
            select: {
                role: true,
                name: true,
                price: true,
                priceLabel: true,
                limits: true,
                features: true,
            },
        });
    }
}
