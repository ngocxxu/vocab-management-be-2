import { AdminPlanDto, PlanService } from '@/domains/catalog/plan';
import { RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

@Controller('admin/plans')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([UserRole.ADMIN])
export class AdminPlansController {
    public constructor(private readonly planService: PlanService) {}

    @Get()
    @ApiOperation({ summary: 'List every plan, inactive ones included (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: AdminPlanDto })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Caller is not an admin' })
    public async list(): Promise<AdminPlanDto[]> {
        return this.planService.findAllForAdmin();
    }
}
