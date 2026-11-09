import { Roles, RolesGuard } from '@/auth';
import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AiModelCatalogDto, AiModelCatalogQueryInput } from '../dto/ai-model-catalog.dto';
import { AiModelCatalogService, ModelCatalogResult } from '../services/ai-model-catalog.service';

// Shares the `config` prefix with ConfigController. It lives in the AI domain because AiModule already imports ConfigModule; the reverse import would be circular.
@Controller('config')
@ApiTags('config')
@ApiBearerAuth()
export class AiModelCatalogController {
    public constructor(private readonly catalogService: AiModelCatalogService) {}

    @Get('ai-models')
    @HttpCode(HttpStatus.OK)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'List the models a provider reports, for the admin model dropdowns' })
    @ApiResponse({ status: HttpStatus.OK, type: AiModelCatalogDto })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Unknown provider or kind' })
    public async listModels(@Query() query: AiModelCatalogQueryInput): Promise<ModelCatalogResult> {
        return this.catalogService.list(query.provider, query.kind ?? 'text');
    }
}
