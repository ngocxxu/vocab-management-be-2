import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsDefined, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { HasKnownPlanLimit, PlanLimitsInput } from './plan-limits.input';

export class CreatePlanInput {
    @ApiProperty({ enum: UserRole })
    @IsEnum(UserRole)
    public role: UserRole;

    @ApiProperty({ example: 'Free' })
    @IsString()
    @IsNotEmpty()
    public name: string;

    @ApiPropertyOptional({ example: 0, nullable: true })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    public price?: number | null;

    @ApiProperty({ example: 'Free' })
    @IsString()
    @IsNotEmpty()
    public priceLabel: string;

    @ApiProperty({
        description: 'Plan limits; -1 means unlimited',
        type: PlanLimitsInput,
        example: { vocabPerDay: 20, languageFolders: 2, subjects: 5, requestsPerMinute: 20 },
    })
    @IsDefined()
    @HasKnownPlanLimit()
    @ValidateNested()
    @Type(() => PlanLimitsInput)
    public limits: PlanLimitsInput;

    @ApiPropertyOptional({ isArray: true, type: String, example: ['Feature 1'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public features?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public stripePriceId?: string | null;

    @ApiPropertyOptional({ default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    public sortOrder?: number;
}
