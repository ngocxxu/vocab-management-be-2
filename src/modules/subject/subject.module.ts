import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { SubjectController } from './controllers';
import { SubjectRepository } from './repositories';
import { SubjectService } from './services';

@Module({
    imports: [PlanModule],
    controllers: [SubjectController],
    providers: [SubjectRepository, SubjectService],
    exports: [SubjectService],
})
export class SubjectModule {}
