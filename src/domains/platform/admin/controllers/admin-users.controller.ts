import { UserDto } from '@/domains/identity/user/dto';
import { RolesGuard } from '@/shared';
import { CurrentUser, Roles } from '@/shared/decorators';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { AdminUsersQueryDto } from '../dto/admin-users-query.dto';
import { UpdateAdminUserInput } from '../dto/update-admin-user.input';
import { AdminUsersService } from '../services/admin-users.service';

@Controller('admin/users')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([UserRole.ADMIN])
export class AdminUsersController {
    public constructor(private readonly adminUsersService: AdminUsersService) {}

    @Get()
    @ApiOperation({ summary: 'List users with search, filters, sorting and paging (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, description: 'A page of users' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Caller is not an admin' })
    public async list(@Query() query: AdminUsersQueryDto): Promise<PaginationDto<UserDto>> {
        return this.adminUsersService.list(query);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Change a user role or active status (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, description: 'The updated user' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Own account, or an empty change' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Would leave no active admin' })
    public async update(@CurrentUser() actor: User, @Param('id') id: string, @Body() input: UpdateAdminUserInput): Promise<UserDto> {
        return this.adminUsersService.update(actor, id, input);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a user from Supabase and the database (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, description: 'The deleted user' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Own account' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Would leave no active admin' })
    @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Supabase delete failed; nothing was deleted locally' })
    public async remove(@CurrentUser() actor: User, @Param('id') id: string): Promise<UserDto> {
        return this.adminUsersService.remove(actor, id);
    }
}
