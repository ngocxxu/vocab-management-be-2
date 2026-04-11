import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreatePlanInput {
    @ApiProperty({ enum: UserRole })
    public role: UserRole;

    @ApiProperty({ example: 'Free' })
    public name: string;

    @ApiPropertyOptional({ example: 0, nullable: true })
    public price?: number | null;

    @ApiProperty({ example: 'Free' })
    public priceLabel: string;

    @ApiProperty({
        description: 'Plan limits (e.g. vocabPerDay, languageFolders, subjects, requestsPerMinute)',
        example: { vocabPerDay: 20, languageFolders: 2, subjects: 3, requestsPerMinute: 20 },
    })
    public limits: Record<string, unknown>;

    @ApiPropertyOptional({ isArray: true, type: String, example: ['Feature 1'] })
    public features?: string[];

    @ApiPropertyOptional()
    public stripePriceId?: string | null;

    @ApiPropertyOptional({ default: 0 })
    public sortOrder?: number;
}
