import { IResponse, LoggerService, RolesGuard } from '@/shared';
import { CurrentUser, Roles } from '@/shared/decorators';
import { Body, Controller, Delete, Get, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { ApiKeyDto, CreateApiKeyInput, CreateApiKeyResponseDto } from '../dto';
import { ApiKeyService } from '../services';

@Controller('api-keys')
@ApiTags('api-key')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles([UserRole.ADMIN, UserRole.MEMBER])
export class ApiKeyController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly apiKeyService: ApiKeyService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'List your API keys' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: ApiKeyDto })
    public async find(@CurrentUser() user: User): Promise<IResponse<ApiKeyDto[]>> {
        return this.apiKeyService.find(user.id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new API key. The raw key is only ever returned in this response.' })
    @ApiResponse({ status: HttpStatus.CREATED, type: CreateApiKeyResponseDto })
    public async create(@Body() input: CreateApiKeyInput, @CurrentUser() user: User): Promise<CreateApiKeyResponseDto> {
        const apiKey = await this.apiKeyService.create(input, user.id);
        this.logger.info(`Created new API key with ID ${apiKey.id}`);
        return apiKey;
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete an API key' })
    @ApiResponse({ status: HttpStatus.OK, type: ApiKeyDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'API key not found' })
    public async delete(@Param('id') id: string, @CurrentUser() user: User): Promise<ApiKeyDto> {
        const apiKey = await this.apiKeyService.delete(id, user.id);
        this.logger.info(`Deleted API key with ID ${id}`);
        return apiKey;
    }
}
