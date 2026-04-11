import { Module } from '@nestjs/common';
import { PlanController } from './controllers/plan.controller';
import { PlanQuotaService } from './services/plan-quota.service';
import { PlanService } from './services/plan.service';

@Module({
    imports: [],
    controllers: [PlanController],
    providers: [PlanQuotaService, PlanService],
    exports: [PlanQuotaService],
})
export class PlanModule {}
