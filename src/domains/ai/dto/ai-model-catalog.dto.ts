import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CATALOG_KINDS, CATALOG_PROVIDERS, CatalogKind, CatalogModel, CatalogProvider } from '../utils/ai-model-catalog.util';

export class AiModelCatalogQueryInput {
    @ApiProperty({ description: 'Provider whose models to list', enum: CATALOG_PROVIDERS })
    @IsIn(CATALOG_PROVIDERS)
    public readonly provider: CatalogProvider;

    @ApiPropertyOptional({ description: 'text for chat and generation models, audio for transcription models', enum: CATALOG_KINDS, default: 'text' })
    @IsOptional()
    @IsIn(CATALOG_KINDS)
    public readonly kind?: CatalogKind;
}

export class AiModelDto {
    @ApiProperty({ description: 'Model id as the provider expects it', example: '@cf/qwen/qwen3-30b-a3b-fp8' })
    public readonly id: string;

    @ApiProperty({ description: 'Display name', example: 'Qwen3 30B' })
    public readonly name: string;
}

export class AiModelCatalogDto {
    @ApiProperty({ enum: CATALOG_PROVIDERS })
    public readonly provider: CatalogProvider;

    @ApiProperty({ enum: CATALOG_KINDS })
    public readonly kind: CatalogKind;

    @ApiProperty({ type: [AiModelDto], description: 'Models the provider reports. Advisory only: it says nothing about price or free tier.' })
    public readonly models: CatalogModel[];

    @ApiProperty({ description: 'True when the provider could not be reached; models is then the last good list or empty' })
    public readonly degraded: boolean;
}
