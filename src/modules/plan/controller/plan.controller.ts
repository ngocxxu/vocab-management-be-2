import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common';
import { Roles } from '../../common/decorator';
import { Public } from '../../common/decorator/public.decorator';
import { CreatePlanInput } from '../model/create-plan.input';
import { PlanDto } from '../model/plan.dto';
import { UpdatePlanInput } from '../model/update-plan.input';
import { PlanService } from '../service/plan.service';

@Controller('plans')
@ApiTags('plan')
export class PlanController {
    public constructor(private readonly planService: PlanService) {}

    @Get()
    @Public()
    @ApiOperation({ summary: 'List plans (public). Optional role filter.' })
    @ApiQuery({ name: 'role', required: false, enum: UserRole, description: 'Filter by plan role' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: PlanDto })
    public async findAll(@Query('role') role?: string): Promise<PlanDto[]> {
        const roleEnum = role ? this.parseRole(role) : undefined;
        return this.planService.findAll(roleEnum);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create plan (admin only)' })
    @ApiResponse({ status: HttpStatus.CREATED, type: PlanDto })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Plan with this role already exists' })
    public async create(@Body() input: CreatePlanInput): Promise<PlanDto> {
        return this.planService.create(input);
    }

    @Put(':role')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update plan by role (admin only)' })
    @ApiResponse({ status: HttpStatus.OK, type: PlanDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Plan not found' })
    public async update(
        @Param('role') role: string,
        @Body() input: UpdatePlanInput,
    ): Promise<PlanDto> {
        const roleEnum = this.parseRole(role);
        return this.planService.update(roleEnum, input);
    }

    @Delete(':role')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Soft-delete plan by role (admin only, sets isActive false)' })
    @ApiResponse({ status: HttpStatus.OK, type: PlanDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Plan not found' })
    public async remove(@Param('role') role: string): Promise<PlanDto> {
        const roleEnum = this.parseRole(role);
        return this.planService.remove(roleEnum);
    }

    private parseRole(role: string): UserRole {
        if (!Object.values(UserRole).includes(role as UserRole)) {
            throw new BadRequestException(
                `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}`,
            );
        }
        return role as UserRole;
    }
}
