import { AiProviderFactory } from '@/domains/ai/providers/ai-provider.factory';
import { ConfigModule } from '@/domains/platform/config/config.module';
import { EventsModule } from '@/domains/platform/events/events.module';
import { EReminderType } from '@/domains/reminder/utils';
import { VocabModule } from '@/domains/vocab/vocab.module';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { PlanModule } from '../plan';
import { SubjectController } from './controllers';
import { SubjectGenerateProcessor } from './processors';
import { SubjectRepository } from './repositories';
import { AiSubjectService, SubjectService } from './services';

@Module({
    imports: [forwardRef(() => PlanModule), forwardRef(() => VocabModule), ConfigModule, EventsModule, BullModule.registerQueue({ name: EReminderType.SUBJECT_GENERATE })],
    controllers: [SubjectController],
    providers: [SubjectRepository, SubjectService, AiSubjectService, AiProviderFactory, SubjectGenerateProcessor],
    exports: [SubjectService, SubjectRepository],
})
export class SubjectModule {}
