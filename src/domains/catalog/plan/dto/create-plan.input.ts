import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreatePlanInput {
    @ApiProperty({ enum: UserRole })
    role: UserRole;

    @ApiProperty({ example: 'Free' })
    name: string;

    @ApiPropertyOptional({ example: 0, nullable: true })
    price?: number | null;

    @ApiProperty({ example: 'Free' })
    priceLabel: string;

    @ApiProperty({
        description: 'Plan limits (e.g. vocabPerDay, languageFolders, subjects, requestsPerMinute)',
        example: { vocabPerDay: 20, languageFolders: 2, subjects: 3, requestsPerMinute: 20 },
    })
    limits: Record<string, unknown>;

    @ApiPropertyOptional({ isArray: true, type: String, example: ['Feature 1'] })
    features?: string[];

    @ApiPropertyOptional()
    stripePriceId?: string | null;

    @ApiPropertyOptional({ default: 0 })
    sortOrder?: number;
}
