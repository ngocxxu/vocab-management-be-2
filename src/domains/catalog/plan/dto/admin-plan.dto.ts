import { ApiProperty } from '@nestjs/swagger';
import { PlanDto } from './plan.dto';

/** A plan as the admin sees it: inactive plans included, plus the fields the public list hides. */
export class AdminPlanDto extends PlanDto {
    @ApiProperty({ description: 'Plan row id' })
    public id: string;

    @ApiProperty({ description: 'Stripe price id, or null when not linked', nullable: true })
    public stripePriceId: string | null;

    @ApiProperty({ description: 'Display order; lower comes first' })
    public sortOrder: number;

    @ApiProperty({ description: 'False hides the plan from the public list' })
    public isActive: boolean;
}
