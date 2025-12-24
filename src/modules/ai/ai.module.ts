import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigModule } from '../config';
import { EventsModule } from '../event/module';
import { EReminderType } from '../reminder/util';
import { AiProcessor } from './processor/ai.processor';
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
    ],
    providers: [
        GeminiProvider,
        OpenRouterProvider,
        GroqProvider,
        AiProviderFactory,
        AiService,
        AiProcessor,
    ],
    exports: [AiService],
})
export class AiModule {}
