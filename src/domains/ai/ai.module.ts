import { Module, forwardRef } from '@nestjs/common';
import { LanguageModule } from '../catalog/language';
import { WordTypeModule } from '../catalog/word-type';
import { UserModule } from '../identity/user';
import { NotificationModule } from '../notification';
import { ConfigModule } from '../platform/config';
import { EventsModule } from '../platform/events';
import { ReminderModule } from '../reminder';
import { VocabModule } from '../vocab';
import { VocabTrainerModule } from '../vocab-trainer';
import { AudioEvaluationProcessor } from './processors/audio-evaluation.processor';
import { FillInBlankEvaluationProcessor } from './processors/fill-in-blank-evaluation.processor';
import { MultipleChoiceGenerationProcessor } from './processors/multiple-choice-generation.processor';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { AiAudioService } from './services/ai-audio.service';
import { AiFillInBlankGradingService } from './services/ai-fill-in-blank-grading.service';
import { AiLanguageNameService } from './services/ai-language-name.service';
import { AiMultipleChoiceService } from './services/ai-multiple-choice.service';
import { AiQueueService } from './services/ai-queue.service';
import { AiTranslationEvaluationService } from './services/ai-translation-evaluation.service';
import { AiTranslationService } from './services/ai-translation.service';
import { AiService } from './services/ai.service';

@Module({
    imports: [
        ConfigModule,
        EventsModule,
        LanguageModule,
        NotificationModule,
        ReminderModule,
        UserModule,
        WordTypeModule,
        forwardRef(() => VocabModule),
        forwardRef(() => VocabTrainerModule),
    ],
    providers: [
        GeminiProvider,
        OpenRouterProvider,
        GroqProvider,
        AiProviderFactory,
        AiLanguageNameService,
        AiTranslationService,
        AiFillInBlankGradingService,
        AiMultipleChoiceService,
        AiAudioService,
        AiTranslationEvaluationService,
        AiQueueService,
        AiService,
        AudioEvaluationProcessor,
        MultipleChoiceGenerationProcessor,
        FillInBlankEvaluationProcessor,
    ],
    exports: [AiService],
})
export class AiModule {}
