import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PlanController } from './controller/plan.controller';
import { PlanQuotaService } from './service/plan-quota.service';
import { PlanService } from './service/plan.service';

@Module({
    imports: [CommonModule],
    controllers: [PlanController],
    providers: [PlanQuotaService, PlanService],
    exports: [PlanQuotaService],
})
export class PlanModule {}
