import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigModule } from '../config';
import { EventsModule } from '../event/module';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { EReminderType } from '../reminder/util';
import { VocabModule } from '../vocab/vocab.module';
import { AudioEvaluationProcessor } from './processor/audio-evaluation.processor';
import { FillInBlankEvaluationProcessor } from './processor/fill-in-blank-evaluation.processor';
import { MultipleChoiceGenerationProcessor } from './processor/multiple-choice-generation.processor';
import { AiProviderFactory } from './provider/ai-provider.factory';
import { GeminiProvider } from './provider/gemini.provider';
import { GroqProvider } from './provider/groq.provider';
import { OpenRouterProvider } from './provider/openrouter.provider';
import { AiService } from './service/ai.service';

@Module({
    imports: [
        CommonModule,
        ConfigModule,
        EventsModule,
        NotificationModule,
        ReminderModule,
        forwardRef(() => VocabModule),
        BullModule.registerQueue({
            name: EReminderType.AUDIO_EVALUATION,
        }),
        BullModule.registerQueue({
            name: EReminderType.MULTIPLE_CHOICE_GENERATION,
        }),
        BullModule.registerQueue({
            name: EReminderType.FILL_IN_BLANK_EVALUATION,
        }),
    ],
    providers: [
        GeminiProvider,
        OpenRouterProvider,
        GroqProvider,
        AiProviderFactory,
        AiService,
        AudioEvaluationProcessor,
        MultipleChoiceGenerationProcessor,
        FillInBlankEvaluationProcessor,
    ],
    exports: [AiService],
})
export class AiModule {}
