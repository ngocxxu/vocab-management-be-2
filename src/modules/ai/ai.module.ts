import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigModule } from '../config';
import { EventsModule } from '../event/module';
import { LanguageModule } from '../language/language.module';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { EReminderType } from '../reminder/util';
import { VocabModule } from '../vocab/vocab.module';
import { WordTypeModule } from '../word-type/word-type.module';
import { AudioEvaluationProcessor } from './processor/audio-evaluation.processor';
import { FillInBlankEvaluationProcessor } from './processor/fill-in-blank-evaluation.processor';
import { MultipleChoiceGenerationProcessor } from './processor/multiple-choice-generation.processor';
import { AiProviderFactory } from './provider/ai-provider.factory';
import { GeminiProvider } from './provider/gemini.provider';
import { GroqProvider } from './provider/groq.provider';
import { OpenRouterProvider } from './provider/openrouter.provider';
import { AiAudioService } from './service/ai-audio.service';
import { AiFillInBlankGradingService } from './service/ai-fill-in-blank-grading.service';
import { AiLanguageNameService } from './service/ai-language-name.service';
import { AiMultipleChoiceService } from './service/ai-multiple-choice.service';
import { AiQueueService } from './service/ai-queue.service';
import { AiService } from './service/ai.service';
import { AiTranslationEvaluationService } from './service/ai-translation-evaluation.service';
import { AiTranslationService } from './service/ai-translation.service';

@Module({
    imports: [
        CommonModule,
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
