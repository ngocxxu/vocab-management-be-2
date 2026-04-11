import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePlanInput {
    @ApiPropertyOptional({ example: 'Free' })
    @IsOptional()
    @IsString()
    public name?: string;

    @ApiPropertyOptional({ example: 0, nullable: true })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    public price?: number | null;

    @ApiPropertyOptional({ example: 'Free' })
    @IsOptional()
    @IsString()
    public priceLabel?: string;

    @ApiPropertyOptional({
        description: 'Plan limits (e.g. vocabPerDay, languageFolders, subjects, requestsPerMinute)',
    })
    @IsOptional()
    @IsObject()
    public limits?: Record<string, unknown>;

    @ApiPropertyOptional({ isArray: true, type: String })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public features?: string[];

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    public stripePriceId?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public sortOrder?: number;

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    public isActive?: boolean;
}
