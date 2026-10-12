import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';
import { HasKnownPlanLimit, PlanLimitsInput } from './plan-limits.input';

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
        description: 'Plan limits; replaces the stored set. -1 means unlimited',
        type: PlanLimitsInput,
    })
    // IsOptional would also skip null, letting {limits: null} reach the mapper; only undefined may be skipped.
    @ValidateIf((_, value) => value !== undefined)
    @HasKnownPlanLimit()
    @ValidateNested()
    @Type(() => PlanLimitsInput)
    public limits?: PlanLimitsInput;

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
