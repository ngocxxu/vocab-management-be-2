import { Prisma, UserRole } from '@prisma/client';
import { CreatePlanInput } from '../dto/create-plan.input';
import { PlanDto, PlanLimitsDto } from '../dto/plan.dto';
import { UpdatePlanInput } from '../dto/update-plan.input';

export type PlanListRow = {
    role: UserRole;
    name: string;
    price: unknown;
    priceLabel: string;
    limits: unknown;
    features: unknown;
};

export class PlanMapper {
    public toCreateInput(input: CreatePlanInput): Prisma.PlanCreateInput {
        return {
            role: input.role,
            name: input.name,
            price: input.price ?? undefined,
            priceLabel: input.priceLabel,
            limits: input.limits as object,
            features: input.features ?? undefined,
            stripePriceId: input.stripePriceId ?? undefined,
            sortOrder: input.sortOrder ?? 0,
        };
    }

    public toUpdateInput(input: UpdatePlanInput): Prisma.PlanUpdateInput {
        const data: Prisma.PlanUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.price !== undefined) data.price = input.price;
        if (input.priceLabel !== undefined) data.priceLabel = input.priceLabel;
        if (input.limits !== undefined) data.limits = input.limits as Prisma.InputJsonValue;
        if (input.features !== undefined) data.features = input.features as Prisma.InputJsonValue;
        if (input.stripePriceId !== undefined) data.stripePriceId = input.stripePriceId;
        if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
        if (input.isActive !== undefined) data.isActive = input.isActive;
        return data;
    }

    public toDto(p: PlanListRow): PlanDto {
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
