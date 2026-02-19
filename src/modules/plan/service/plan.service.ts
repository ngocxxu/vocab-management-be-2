import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../common';
import { CreatePlanInput } from '../model/create-plan.input';
import { PlanDto, PlanLimitsDto } from '../model/plan.dto';
import { UpdatePlanInput } from '../model/update-plan.input';

@Injectable()
export class PlanService {
    public constructor(private readonly prisma: PrismaService) {}

    public async create(input: CreatePlanInput): Promise<PlanDto> {
        const plan = await this.prisma.plan.create({
            data: {
                role: input.role,
                name: input.name,
                price: input.price ?? undefined,
                priceLabel: input.priceLabel,
                limits: input.limits as object,
                features: input.features ?? undefined,
                stripePriceId: input.stripePriceId ?? undefined,
                sortOrder: input.sortOrder ?? 0,
            },
        });
        return this.toDto(plan);
    }

    public async update(role: UserRole, input: UpdatePlanInput): Promise<PlanDto> {
        const data: Prisma.PlanUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.price !== undefined) data.price = input.price;
        if (input.priceLabel !== undefined) data.priceLabel = input.priceLabel;
        if (input.limits !== undefined) data.limits = input.limits as Prisma.InputJsonValue;
        if (input.features !== undefined) data.features = input.features as Prisma.InputJsonValue;
        if (input.stripePriceId !== undefined) data.stripePriceId = input.stripePriceId;
        if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
        if (input.isActive !== undefined) data.isActive = input.isActive;

        const plan = await this.prisma.plan
            .update({
                where: { role },
                data,
            })
            .catch((err: { code?: string }) => {
                if (err?.code === 'P2025') {
                    throw new NotFoundException(`Plan with role ${role} not found`);
                }
                throw err;
            });
        return this.toDto(plan);
    }

    public async remove(role: UserRole): Promise<PlanDto> {
        const plan = await this.prisma.plan
            .update({
                where: { role },
                data: { isActive: false },
            })
            .catch((err: { code?: string }) => {
                if (err?.code === 'P2025') {
                    throw new NotFoundException(`Plan with role ${role} not found`);
                }
                throw err;
            });
        return this.toDto(plan);
    }

    public async findAll(role?: UserRole): Promise<PlanDto[]> {
        const plans = await this.prisma.plan.findMany({
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
        return plans.map((p) => this.toDto(p));
    }

    private toDto(p: {
        role: UserRole;
        name: string;
        price: unknown;
        priceLabel: string;
        limits: unknown;
        features: unknown;
    }): PlanDto {
        return {
            role: p.role,
            name: p.name,
            price: p.price === null || p.price === undefined ? null : Number(p.price),
            priceLabel: p.priceLabel,
            limits: p.limits as PlanLimitsDto,
            features: (p.features as string[]) ?? [],
        };
    }
}
