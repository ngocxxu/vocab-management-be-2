import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlanInput {
    @ApiPropertyOptional({ example: 'Free' })
    name?: string;

    @ApiPropertyOptional({ example: 0, nullable: true })
    price?: number | null;

    @ApiPropertyOptional({ example: 'Free' })
    priceLabel?: string;

    @ApiPropertyOptional({
        description: 'Plan limits (e.g. vocabPerDay, languageFolders, subjects, requestsPerMinute)',
    })
    limits?: Record<string, unknown>;

    @ApiPropertyOptional({ isArray: true, type: String })
    features?: string[];

    @ApiPropertyOptional({ nullable: true })
    stripePriceId?: string | null;

    @ApiPropertyOptional()
    sortOrder?: number;

    @ApiPropertyOptional({ default: true })
    isActive?: boolean;
}
