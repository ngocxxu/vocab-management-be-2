import { Injectable, Logger } from '@nestjs/common';
import { CreateTextTargetInput } from '../../vocab/model/vocab.input';
import { VocabWithTextTargets } from '../../vocab-trainer/util';
import { AiProviderFactory } from '../provider/ai-provider.factory';
import { parseJsonOrThrow } from '../util/ai-json.util';
import { EvaluationResult, MultipleChoiceQuestion } from '../util/type.util';
import { AiAudioService } from './ai-audio.service';
import { AiFillInBlankGradingService } from './ai-fill-in-blank-grading.service';
import { AiLanguageNameService } from './ai-language-name.service';
import { AiMultipleChoiceService } from './ai-multiple-choice.service';
import { AiQueueService } from './ai-queue.service';
import { AiTranslationEvaluationService } from './ai-translation-evaluation.service';
import { AiTranslationService } from './ai-translation.service';
import {
    EvaluateTranslationParams,
    QueueAudioEvaluationParams,
    QueueFillInBlankEvaluationParams,
    QueueMultipleChoiceGenerationParams,
} from './ai.service-types';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly translationService: AiTranslationService,
        private readonly multipleChoiceService: AiMultipleChoiceService,
        private readonly fillInBlankGradingService: AiFillInBlankGradingService,
        private readonly audioService: AiAudioService,
        private readonly translationEvaluationService: AiTranslationEvaluationService,
        private readonly queueService: AiQueueService,
        private readonly languageNameService: AiLanguageNameService,
    ) {}

    /**
     * Translate vocab using AI when textTargets is empty
     */
    public async translateVocab(
        textSource: string,
        sourceLanguageCode: string,
        targetLanguageCode: string,
        subjectIds?: string[],
        userId?: string,
        retryCount = 0,
    ): Promise<CreateTextTargetInput> {
        return this.translationService.translateVocab(
            textSource,
            sourceLanguageCode,
            targetLanguageCode,
            subjectIds,
            userId,
            retryCount,
        );
    }

    /**
     * Generate multiple choice questions for vocabulary training
     */
    public async generateMultipleChoiceQuestions(
        vocabList: VocabWithTextTargets[],
        userId?: string,
    ): Promise<MultipleChoiceQuestion[]> {
        return this.multipleChoiceService.generateMultipleChoiceQuestions(vocabList, userId);
    }

    /**
     * Evaluate all fill-in-blank answers in a single batch request
     */
    public async evaluateAllFillInBlankAnswers(
        evaluations: Array<{
            vocab: VocabWithTextTargets;
            userAnswer: string;
            systemAnswer: string;
            questionType: 'textSource' | 'textTarget';
        }>,
        userId?: string,
    ): Promise<Array<{ isCorrect: boolean; explanation?: string }>> {
        return this.fillInBlankGradingService.evaluateAllFillInBlankAnswers(evaluations, userId);
    }

    public async queueAudioEvaluation(
        params: QueueAudioEvaluationParams,
    ): Promise<{ jobId: string }> {
        return this.queueService.queueAudioEvaluation(params);
    }

    public async queueMultipleChoiceGeneration(
        params: QueueMultipleChoiceGenerationParams,
    ): Promise<{ jobId: string }> {
        return this.queueService.queueMultipleChoiceGeneration(params);
    }

    public async queueFillInBlankEvaluation(
        params: QueueFillInBlankEvaluationParams,
    ): Promise<{ jobId: string }> {
        return this.queueService.queueFillInBlankEvaluation(params);
    }

    public async downloadAudioFromCloudinary(fileId: string): Promise<Buffer> {
        return this.audioService.downloadAudioFromCloudinary(fileId);
    }

    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguageCode: string,
        userId?: string,
        retryCount = 0,
    ): Promise<string> {
        return this.audioService.transcribeAudio(
            audioBuffer,
            mimeType,
            sourceLanguageCode,
            userId,
            retryCount,
        );
    }

    public async evaluateTranslation(params: EvaluateTranslationParams): Promise<EvaluationResult> {
        return this.translationEvaluationService.evaluateTranslation(params);
    }

    public formatMarkdownReport(evaluation: EvaluationResult, transcript: string): string {
        return this.translationEvaluationService.formatMarkdownReport(evaluation, transcript);
    }

    public async generateDialogueForVocabs(
        targetLanguageWords: string[],
        sourceLanguageWords: string[],
        targetLanguageCode: string,
        sourceLanguageCode: string,
        userId?: string,
        retryCount = 0,
    ): Promise<{ dialogue: Array<{ speaker: string; text: string }>; vocabWordsUsed: string[] }> {
        try {
            const targetLanguageName =
                await this.languageNameService.getLanguageName(targetLanguageCode);
            const sourceLanguageName =
                await this.languageNameService.getLanguageName(sourceLanguageCode);

            const wordsList = targetLanguageWords.join(', ');
            const sourceWordsList = sourceLanguageWords.join(', ');
            const prompt = `
    You are a language learning assistant. Generate a natural dialogue between two speakers (A and B) 
    in ${targetLanguageName} that incorporates ALL of the following vocabulary words naturally:

    Vocabulary words (${targetLanguageName}): ${wordsList}

    Important context:
    - This dialogue will be translated by the user from ${targetLanguageName} to ${sourceLanguageName}
    - When the user translates this dialogue, they MUST use the source words or their synonyms: ${sourceWordsList}
    - The dialogue should be structured so that when translated, it naturally requires the use of these source words

    Requirements:
    1. Create a conversation between speakers A and B
    2. Use ALL the provided vocabulary words naturally in context
    3. The dialogue should be realistic and appropriate
    4. The dialogue must have EXACTLY 4 lines total: 2 lines from speaker A and 2 lines from speaker B
    5. Return the dialogue in JSON format

    Format your response as JSON:
    {
        "dialogue": [
            {"speaker": "A", "text": "..."},
            {"speaker": "B", "text": "..."},
            {"speaker": "A", "text": "..."},
            {"speaker": "B", "text": "..."}
        ]
    }

    Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
                `;

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            return parseJsonOrThrow<{
                dialogue: Array<{ speaker: string; text: string }>;
                vocabWordsUsed: string[];
            }>(text);
        } catch (error) {
            this.logger.error(`Error generating dialogue (attempt ${retryCount + 1}):`, error);
            throw error;
        }
    }
}
