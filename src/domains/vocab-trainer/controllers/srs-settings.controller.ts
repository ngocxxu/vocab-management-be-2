import type { SrsSettings } from '../utils/fsrs-defaults.schema';
import { RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { CurrentUser } from '@/shared/decorators/user.decorator';
import { Body, Controller, Get, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { UpdateSrsSettingsInput } from '../dto';
import { FsrsDefaultsService } from '../services/fsrs-defaults.service';

@Controller('srs-settings')
@ApiTags('srs-settings')
@ApiBearerAuth()
export class SrsSettingsController {
    public constructor(private readonly fsrsDefaultsService: FsrsDefaultsService) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'FSRS defaults and timezone of the current user (system defaults for what is not set)' })
    @ApiResponse({ status: HttpStatus.OK })
    public async getSettings(@CurrentUser() user: User): Promise<SrsSettings> {
        return this.fsrsDefaultsService.getSettings(user.id);
    }

    @Put()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Change the FSRS defaults and/or the timezone. Only the fields that are sent change; trainers that already exist are not touched.' })
    @ApiResponse({ status: HttpStatus.OK })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'A value is out of range, unknown, or the timezone does not exist' })
    public async updateSettings(@Body() input: UpdateSrsSettingsInput, @CurrentUser() user: User): Promise<SrsSettings> {
        return this.fsrsDefaultsService.updateSettings(user.id, input);
    }
}
