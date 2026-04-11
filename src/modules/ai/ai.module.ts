import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '../config';
import { EventsModule } from '../event/module';
import { LanguageModule } from '../language/language.module';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { EReminderType } from '../reminder/utils';
import { VocabModule } from '../vocab/vocab.module';
import { WordTypeModule } from '../word-type/word-type.module';
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
import { AiService } from './services/ai.service';
import { AiTranslationEvaluationService } from './services/ai-translation-evaluation.service';
import { AiTranslationService } from './services/ai-translation.service';

@Module({
    imports: [
        ConfigModule,
        EventsModule,
        LanguageModule,
        NotificationModule,
        ReminderModule,
        WordTypeModule,
        forwardRef(() => VocabModule),
        BullModule.registerQueue({
            name: EReminderType.AUDIO_EVALUATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.AUDIO_EVALUATION,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.MULTIPLE_CHOICE_GENERATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.MULTIPLE_CHOICE_GENERATION,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.FILL_IN_BLANK_EVALUATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.FILL_IN_BLANK_EVALUATION,
            adapter: BullAdapter,
        }),
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
