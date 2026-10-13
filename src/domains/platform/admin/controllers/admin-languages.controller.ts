import { AdminLanguageDto, LanguageService } from '@/domains/catalog/language';
import { RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

// Writes stay on the public /languages routes, which the BE already guards with the admin role.
@Controller('admin/languages')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([UserRole.ADMIN])
export class AdminLanguagesController {
    public constructor(private readonly languageService: LanguageService) {}

    @Get()
    @ApiOperation({ summary: 'List languages with how many vocabs and folders use each (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: AdminLanguageDto })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Caller is not an admin' })
    public async list(): Promise<AdminLanguageDto[]> {
        return this.languageService.findAllForAdmin();
    }
}
