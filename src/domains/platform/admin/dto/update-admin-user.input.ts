import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/** At least one field is required; the service rejects an empty body with 400. */
export class UpdateAdminUserInput {
    @ApiPropertyOptional({ enum: UserRole })
    @IsOptional()
    @IsEnum(UserRole)
    public readonly role?: UserRole;

    @ApiPropertyOptional({ description: 'false deactivates, true reactivates' })
    @IsOptional()
    @IsBoolean()
    public readonly isActive?: boolean;

    @ApiPropertyOptional({ description: 'true lets the user use the public MCP endpoint; false blocks it on the next request' })
    @IsOptional()
    @IsBoolean()
    public readonly mcpAccess?: boolean;
}
