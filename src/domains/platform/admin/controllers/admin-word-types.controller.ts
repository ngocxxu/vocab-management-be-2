import { AdminWordTypeDto, WordTypeService } from '@/domains/catalog/word-type';
import { RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

// Writes stay on the public /word-types routes, which the BE already guards with the admin role.
@Controller('admin/word-types')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([UserRole.ADMIN])
export class AdminWordTypesController {
    public constructor(private readonly wordTypeService: WordTypeService) {}

    @Get()
    @ApiOperation({ summary: 'List word types with how many text targets use each (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: AdminWordTypeDto })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Caller is not an admin' })
    public async list(): Promise<AdminWordTypeDto[]> {
        return this.wordTypeService.findAllForAdmin();
    }
}
