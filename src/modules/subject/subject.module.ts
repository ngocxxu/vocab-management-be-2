import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { PlanModule } from '../plan/plan.module';
import { SubjectController } from './controller';
import { SubjectRepository } from './repository';
import { SubjectService } from './service';

@Module({
    imports: [CommonModule, PlanModule],
    controllers: [SubjectController],
    providers: [SubjectRepository, SubjectService],
    exports: [SubjectService],
})
export class SubjectModule {}
