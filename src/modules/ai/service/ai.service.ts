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

    public async queueAudioEvaluation(params: {
        fileId: string;
        targetDialogue: Array<{ speaker: string; text: string }>;
        sourceLanguage: string;
        targetLanguage: string;
        sourceWords: string[];
        targetStyle?: 'formal' | 'informal';
        targetAudience?: string;
        userId: string;
        vocabTrainerId: string;
    }): Promise<{ jobId: string }> {
        return this.queueService.queueAudioEvaluation(params);
    }

    public async queueMultipleChoiceGeneration(params: {
        vocabTrainerId: string;
        vocabList: VocabWithTextTargets[];
        userId: string;
    }): Promise<{ jobId: string }> {
        return this.queueService.queueMultipleChoiceGeneration(params);
    }

    public async queueFillInBlankEvaluation(params: {
        vocabTrainerId: string;
        evaluations: Array<{
            vocab: VocabWithTextTargets;
            userAnswer: string;
            systemAnswer: string;
            questionType: 'textSource' | 'textTarget';
            vocabId: string;
        }>;
        answerSubmissions: Array<{
            userAnswer: string;
            systemAnswer: string;
        }>;
        userId: string;
    }): Promise<{ jobId: string }> {
        return this.queueService.queueFillInBlankEvaluation(params);
    }

    public async downloadAudioFromCloudinary(fileId: string): Promise<Buffer> {
        return this.audioService.downloadAudioFromCloudinary(fileId);
    }

    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
        retryCount = 0,
    ): Promise<string> {
        return this.audioService.transcribeAudio(
            audioBuffer,
            mimeType,
            sourceLanguage,
            userId,
            retryCount,
        );
    }

    public async evaluateTranslation(params: {
        targetDialogue: Array<{ speaker: string; text: string }>;
        transcript: string;
        sourceLanguage: string;
        targetLanguage: string;
        sourceWords: string[];
        targetStyle?: 'formal' | 'informal';
        targetAudience?: string;
        userId?: string;
        retryCount?: number;
    }): Promise<EvaluationResult> {
        return this.translationEvaluationService.evaluateTranslation(params);
    }

    public formatMarkdownReport(evaluation: EvaluationResult, transcript: string): string {
        const safe = <T, U>(v: T | undefined, d: U) => v ?? (d as unknown as T);

        let report = '# Translation Evaluation Report\n\n';

        // Overall + score breakdown
        report += `## Overall Score: ${safe(evaluation.overallScore, 0)} / 100\n\n`;
        report += '### Detailed Scores (scale 0–10)\n';
        report += `- **Accuracy**: ${safe(
            evaluation.scores?.accuracy,
            0,
        )}/10 — Semantic correctness (penalize omissions/additions). \n`;
        report += `- **Fluency**: ${safe(
            evaluation.scores?.fluency,
            0,
        )}/10 — Naturalness, grammar, cohesion.\n`;
        report += `- **Register**: ${safe(
            evaluation.scores?.register,
            0,
        )}/10 — Tone / formality appropriateness.\n`;
        report += `- **Completeness**: ${safe(
            evaluation.scores?.completeness,
            0,
        )}/10 — Coverage of source ideas (computed from meaning coverage %).\n\n`;

        // Optional: show scoring formula used by evaluator
        report += '### Scoring Formula\n';
        report +=
            'OverallScore = accuracy * 2.5 + fluency * 2 + register * 1.5 + completeness * 4 (clamped 0–100)\n\n';

        // Errors
        const errors = safe(evaluation.errors, []);
        if (Array.isArray(errors) && errors.length > 0) {
            report += '## Errors Found (ordered)\n\n';
            errors.forEach((error) => {
                const idx = typeof error.index === 'number' ? error.index : undefined;
                const indexPrefix = idx === undefined ? '' : `**${idx}.**`;
                report += `${indexPrefix}**Location**: ${safe(error.span, '(unknown span)')}  \n`;
                report += `- **Type**: ${safe(error.type, '(unknown)')}  \n`;
                report += `- **Issue**: ${safe(error.explanation, '(no explanation)')}  \n`;
                report += `- **Suggestion**: ${safe(error.suggestion, '(no suggestion)')}  \n\n`;
            });
        } else {
            report += '## Errors Found\n\nNo specific errors detected.\n\n';
        }

        // Source / transcript
        report += '## Your Transcript (ASR)\n\n';
        report += `${transcript || '(no transcript)'}\n\n`;

        // Corrected translation
        report += '## Corrected Translation (full)\n\n';
        report += `${safe(evaluation.correctedTranslation, '(no corrected translation)')}\n\n`;

        // Missing ideas
        const missing = safe(evaluation.missingIdeas, []);
        if (Array.isArray(missing) && missing.length > 0) {
            report +=
                '## Missing Ideas (explicit list of source ideas not covered by the transcript)\n\n';
            missing.forEach((mi, i) => {
                report += `${i + 1}. ${mi}\n`;
            });
            report += '\n';
        }

        // Advice / improvement tips
        const advice = safe(evaluation.advice, []);
        if (Array.isArray(advice) && advice.length > 0) {
            report += '## Improvement Tips (actionable)\n\n';
            advice.forEach((tip) => {
                report += `- ${tip}\n`;
            });
            report += '\n';
        }

        return report;
    }

    public async generateDialogueForVocabs(
        targetLanguageWords: string[],
        sourceLanguageWords: string[],
        targetLanguage: string,
        sourceLanguage: string,
        userId?: string,
        retryCount = 0,
    ): Promise<{ dialogue: Array<{ speaker: string; text: string }>; vocabWordsUsed: string[] }> {
        try {
            const targetLanguageName =
                await this.languageNameService.getLanguageName(targetLanguage);
            const sourceLanguageName =
                await this.languageNameService.getLanguageName(sourceLanguage);

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
