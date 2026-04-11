import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PlanMapper } from '../mappers';
import { CreatePlanInput } from '../dto/create-plan.input';
import { PlanDto } from '../dto/plan.dto';
import { UpdatePlanInput } from '../dto/update-plan.input';
import { PlanRepository } from '../repositories';

@Injectable()
export class PlanService {
    private readonly planMapper = new PlanMapper();

    public constructor(private readonly planRepository: PlanRepository) {}

    public async create(input: CreatePlanInput): Promise<PlanDto> {
        const plan = await this.planRepository.create(this.planMapper.toCreateInput(input));
        return this.planMapper.toDto(plan);
    }

    public async update(role: UserRole, input: UpdatePlanInput): Promise<PlanDto> {
        const plan = await this.planRepository
            .updateByRole(role, this.planMapper.toUpdateInput(input))
            .catch((err: { code?: string }) => {
                if (err?.code === 'P2025') {
                    throw new NotFoundException(`Plan with role ${role} not found`);
                }
                throw err;
            });
        return this.planMapper.toDto(plan);
    }

    public async remove(role: UserRole): Promise<PlanDto> {
        const plan = await this.planRepository
            .updateByRole(role, { isActive: false })
            .catch((err: { code?: string }) => {
                if (err?.code === 'P2025') {
                    throw new NotFoundException(`Plan with role ${role} not found`);
                }
                throw err;
            });
        return this.planMapper.toDto(plan);
    }

    public async findAll(role?: UserRole): Promise<PlanDto[]> {
        const plans = await this.planRepository.findManyActive(role);
        return plans.map((p) => this.planMapper.toDto(p));
    }
}
