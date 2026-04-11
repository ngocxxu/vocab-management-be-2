import { Module, forwardRef } from '@nestjs/common';
import { PlanModule } from '../plan';
import { SubjectController } from './controllers';
import { SubjectRepository } from './repositories';
import { SubjectService } from './services';

@Module({
    imports: [forwardRef(() => PlanModule)],
    controllers: [SubjectController],
    providers: [SubjectRepository, SubjectService],
    exports: [SubjectService, SubjectRepository],
})
export class SubjectModule {}
