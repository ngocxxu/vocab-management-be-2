import { RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminStatsDto } from '../dto';
import { AdminStatsService } from '../services';

@Controller('admin/stats')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([UserRole.ADMIN])
export class AdminStatsController {
    public constructor(private readonly adminStatsService: AdminStatsService) {}

    @Get()
    @ApiOperation({ summary: 'Dashboard counts and the 30-day signup series (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, type: AdminStatsDto, description: 'signupsDaily holds 30 zero-filled UTC days, oldest first' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Caller is not an admin' })
    public async getStats(): Promise<AdminStatsDto> {
        return this.adminStatsService.getStats();
    }
}
