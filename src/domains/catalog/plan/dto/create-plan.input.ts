import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

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
        description: 'Plan limits (e.g. vocabPerDay, languageFolders, subjects, requestsPerMinute)',
        example: { vocabPerDay: 20, languageFolders: 2, subjects: 3, requestsPerMinute: 20 },
    })
    @IsObject()
    public limits: Record<string, unknown>;

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
