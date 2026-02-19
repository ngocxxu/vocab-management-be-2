import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class PlanLimitsDto {
    @ApiProperty({ description: 'Max vocabs per day (-1 = unlimited)' })
    public vocabPerDay?: number;

    @ApiProperty({ description: 'Max language folders (-1 = unlimited)' })
    public languageFolders?: number;

    @ApiProperty({ description: 'Max subjects (-1 = unlimited)' })
    public subjects?: number;

    @ApiProperty({ description: 'Max requests per minute' })
    public requestsPerMinute?: number;
}

export class PlanDto {
    @ApiProperty({ enum: UserRole })
    public role: UserRole;

    @ApiProperty({ example: 'Free' })
    public name: string;

    @ApiProperty({ example: 0, nullable: true })
    public price: number | null;

    @ApiProperty({ example: 'Free' })
    public priceLabel: string;

    @ApiProperty({ type: PlanLimitsDto })
    public limits: PlanLimitsDto;

    @ApiProperty({ isArray: true, type: String, example: ['20 vocabs per day', '2 folders'] })
    public features: string[];
}
