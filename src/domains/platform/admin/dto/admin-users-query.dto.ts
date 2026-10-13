import { PaginationDto } from '@/shared/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Query strings arrive as text, and `Boolean('false')` is true, so the value is read explicitly.
const parseOptionalBoolean = ({ value }: { value: unknown }): unknown => {
    if (value === 'true' || value === true) {
        return true;
    }
    if (value === 'false' || value === false) {
        return false;
    }
    return value;
};

export class AdminUsersQueryDto {
    @ApiPropertyOptional({ default: PaginationDto.DEFAULT_PAGE, minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    public readonly page: number = PaginationDto.DEFAULT_PAGE;

    @ApiPropertyOptional({ default: PaginationDto.DEFAULT_PAGE_SIZE, minimum: 1, maximum: 100 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    public readonly pageSize: number = PaginationDto.DEFAULT_PAGE_SIZE;

    @ApiPropertyOptional({ description: 'Matches email, first name or last name' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    public readonly q?: string;

    @ApiPropertyOptional({ enum: UserRole })
    @IsOptional()
    @IsEnum(UserRole)
    public readonly role?: UserRole;

    @ApiPropertyOptional({ description: 'true = active only, false = deactivated only' })
    @IsOptional()
    @Transform(parseOptionalBoolean)
    @IsBoolean()
    public readonly isActive?: boolean;

    @ApiPropertyOptional({ enum: ['createdAt', 'email'], default: 'createdAt' })
    @IsOptional()
    @IsIn(['createdAt', 'email'])
    public readonly sortBy: 'createdAt' | 'email' = 'createdAt';

    @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    public readonly sortOrder: 'asc' | 'desc' = 'desc';
}
