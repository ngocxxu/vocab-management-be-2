import { Body, Controller, Delete, Get, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Prisma, User, UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
import { CurrentUser, Roles } from '../../common/decorator';
import { ConfigPipe } from '../flow';
import { ConfigDto, ConfigInput } from '../model';
import { ConfigService } from '../service';

@Controller('config')
@ApiTags('config')
@ApiBearerAuth()
export class ConfigController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly configService: ConfigService,
    ) {}

    @Get('system/:key')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Get system config by key' })
    @ApiResponse({ status: HttpStatus.OK, type: ConfigDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'System config not found' })
    public async getSystemConfig(@Param('key') key: string): Promise<ConfigDto> {
        return this.configService.getSystemConfig(key);
    }

    @Put('system/:key')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Update system config by key' })
    @ApiResponse({ status: HttpStatus.OK, type: ConfigDto })
    public async setSystemConfig(
        @Param('key') key: string,
        @Body(ConfigPipe) input: ConfigInput,
    ): Promise<ConfigDto> {
        const value: Prisma.InputJsonValue = input.value as Prisma.InputJsonValue;
        const config = await this.configService.setSystemConfig(key, value);
        this.logger.info(`Updated system config with key "${key}"`);
        return config;
    }

    @Delete('system/:key')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Delete system config by key' })
    @ApiResponse({ status: HttpStatus.OK, type: ConfigDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'System config not found' })
    public async deleteSystemConfig(@Param('key') key: string): Promise<ConfigDto> {
        const config = await this.configService.deleteSystemConfig(key);
        this.logger.info(`Deleted system config with key "${key}"`);
        return config;
    }

    @Get('user/:key')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get user config by key' })
    @ApiResponse({ status: HttpStatus.OK, type: ConfigDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User config not found' })
    public async getUserConfig(
        @CurrentUser() userParam: User,
        @Param('key') keyParam: string,
    ): Promise<ConfigDto> {
        const user: User = userParam;
        const userId: string = user.id;
        const key: string = keyParam;
        return this.configService.getUserConfig(userId, key);
    }

    @Put('user/:key')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update user config by key' })
    @ApiResponse({ status: HttpStatus.OK, type: ConfigDto })
    public async setUserConfig(
        @CurrentUser() userParam: User,
        @Param('key') key: string,
        @Body(ConfigPipe) input: ConfigInput,
    ): Promise<ConfigDto> {
        const user: User = userParam;
        const userId: string = user.id;
        const value: Prisma.InputJsonValue = input.value as Prisma.InputJsonValue;
        const config = await this.configService.setUserConfig(userId, key, value);
        this.logger.info(`Updated user config with key "${key}" for user ${userId}`);
        return config;
    }

    @Delete('user/:key')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete user config by key' })
    @ApiResponse({ status: HttpStatus.OK, type: ConfigDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User config not found' })
    public async deleteUserConfig(
        @CurrentUser() userParam: User,
        @Param('key') keyParam: string,
    ): Promise<ConfigDto> {
        const user: User = userParam;
        const userId: string = user.id;
        const key: string = keyParam;
        const config = await this.configService.deleteUserConfig(userId, key);
        this.logger.info(`Deleted user config with key "${key}" for user ${userId}`);
        return config;
    }
}
