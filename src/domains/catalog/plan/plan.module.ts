import { Module, forwardRef } from '@nestjs/common';
import { LanguageFolderModule } from '../language-folder';
import { SubjectModule } from '../subject';
import { PlanController } from './controllers/plan.controller';
import { PlanRepository } from './repositories';
import { PlanQuotaService } from './services/plan-quota.service';
import { PlanService } from './services/plan.service';

@Module({
    imports: [forwardRef(() => LanguageFolderModule), forwardRef(() => SubjectModule)],
    controllers: [PlanController],
    providers: [PlanRepository, PlanQuotaService, PlanService],
    exports: [PlanQuotaService],
})
export class PlanModule {}
