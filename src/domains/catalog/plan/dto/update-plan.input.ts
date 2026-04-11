import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlanInput {
    @ApiPropertyOptional({ example: 'Free' })
    public name?: string;

    @ApiPropertyOptional({ example: 0, nullable: true })
    public price?: number | null;

    @ApiPropertyOptional({ example: 'Free' })
    public priceLabel?: string;

    @ApiPropertyOptional({
        description: 'Plan limits (e.g. vocabPerDay, languageFolders, subjects, requestsPerMinute)',
    })
    public limits?: Record<string, unknown>;

    @ApiPropertyOptional({ isArray: true, type: String })
    public features?: string[];

    @ApiPropertyOptional({ nullable: true })
    public stripePriceId?: string | null;

    @ApiPropertyOptional()
    public sortOrder?: number;

    @ApiPropertyOptional({ default: true })
    public isActive?: boolean;
}
