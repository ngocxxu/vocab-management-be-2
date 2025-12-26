import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigModule } from '../config';
import { EventsModule } from '../event/module';
import { EReminderType } from '../reminder/util';
import { AudioEvaluationProcessor } from './processor/audio-evaluation.processor';
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
        BullModule.registerQueue({
            name: EReminderType.AUDIO_EVALUATION,
        }),
        BullModule.registerQueue({
            name: EReminderType.MULTIPLE_CHOICE_GENERATION,
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
    ],
    exports: [AiService],
})
export class AiModule {}
