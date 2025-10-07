import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/util';

// Configuration interface for AI service
export interface AiServiceConfig {
    modelName: string;
    questionCount: number;
    passingScore: number;
    sourceQuestionProbability: number;
    maxRetries: number;
    retryDelayMs: number;
}

// Constants for AI service configuration
const AI_CONFIG: AiServiceConfig = {
    modelName: 'gemini-2.0-flash',
    questionCount: 4,
    passingScore: 70,
    sourceQuestionProbability: 0.5,
    maxRetries: 2,
    retryDelayMs: 1000,
} as const;

const QUESTION_TYPES = {
    SOURCE: 'textSource',
    TARGET: 'textTarget',
} as const;

export interface MultipleChoiceQuestion {
    correctAnswer: string;
    type: 'textSource' | 'textTarget';
    content: string;
    options: Array<{
        label: string;
        value: string;
    }>;
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly genAI: GoogleGenerativeAI;

    public constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is required');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * Generate multiple choice questions for vocabulary training
     */
    public async generateMultipleChoiceQuestions(
        vocabList: VocabWithTextTargets[],
    ): Promise<MultipleChoiceQuestion[]> {
        try {
            const questions: MultipleChoiceQuestion[] = [];

            for (const vocab of vocabList) {
                const question = await this.generateQuestionForVocab(vocab);
                if (question) {
                    questions.push(question);
                }
            }

            return questions;
        } catch (error) {
            this.logger.error('Error generating multiple choice questions:', error);
            throw error;
        }
    }

    /**
     * Generate a single question for a vocabulary item
     */
    private async generateQuestionForVocab(
        vocab: VocabWithTextTargets,
        retryCount = 0,
    ): Promise<MultipleChoiceQuestion | null> {
        try {
            // Randomly choose whether to ask about source or target
            const isAskingSource = Math.random() < AI_CONFIG.sourceQuestionProbability;

            if (isAskingSource) {
                return await this.generateSourceQuestion(vocab);
            } else {
                return await this.generateTargetQuestion(vocab);
            }
        } catch (error) {
            this.logger.error(
                `Error generating question for vocab ${vocab.id} (attempt ${retryCount + 1}):`,
                error,
            );

            // Retry logic for transient errors
            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn(`Retrying question generation for vocab ${vocab.id}...`);
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1)); // Exponential backoff
                return this.generateQuestionForVocab(vocab, retryCount + 1);
            }

            return null;
        }
    }

    /**
     * Utility method for delay
     */
    private async delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Common method to generate question with prompt template
     */
    private async generateQuestionWithPrompt(promptData: {
        questionType: 'source' | 'target';
        sourceLanguage: string;
        targetLanguage: string;
        sourceText: string;
        targetText: string;
        correctAnswer: string;
        correctAnswerLabel: string;
    }): Promise<{
        content: string;
        options: Array<{ label: string; value: string }>;
        correctAnswer: string;
    }> {
        const model = this.genAI.getGenerativeModel({ model: AI_CONFIG.modelName });

        const isSourceQuestion = promptData.questionType === 'source';
        const questionText = isSourceQuestion
            ? `What is the translation of '${promptData.sourceText}' in [target_language]?`
            : `What is the translation of '${promptData.targetText}' in [source_language]?`;

        const prompt = `
You are a language learning assistant. Generate a multiple choice question for vocabulary practice.

Context:
- Source language: ${promptData.sourceLanguage}
- Target language: ${promptData.targetLanguage}
- Source text: "${promptData.sourceText}"
- Target text: "${promptData.targetText}"
- Correct answer: "${promptData.correctAnswer}"

Task: Create a question asking "${questionText}"

Requirements:
1. The question should ask for the translation
2. Provide ${AI_CONFIG.questionCount} options (A, B, C, D)
3. One option should be the correct answer: "${promptData.correctAnswerLabel}"
4. Generate ${AI_CONFIG.questionCount - 1} plausible but incorrect options that are:
   - Similar length to the correct answer
   - Related to the same topic/context
   - Common words in the target language
   - Not obviously wrong

Format your response as JSON:
{
    "content": "${questionText}",
    "options": [
        {"label": "${promptData.correctAnswerLabel}", "value": "${promptData.correctAnswerLabel}"},
        {"label": "wrong_option_1", "value": "wrong_option_1"},
        {"label": "wrong_option_2", "value": "wrong_option_2"},
        {"label": "wrong_option_3", "value": "wrong_option_3"}
    ],
    "correctAnswer": "${promptData.correctAnswerLabel}"
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Parse JSON response - handle markdown code blocks
        const parsedResponse = this.parseJsonResponse(text);

        // Shuffle options to randomize correct answer position
        const shuffledOptions = shuffleArray(parsedResponse.options);

        return {
            ...parsedResponse,
            options: shuffledOptions,
        };
    }

    /**
     * Parse JSON response from AI model
     */
    private parseJsonResponse(text: string): {
        content: string;
        options: Array<{ label: string; value: string }>;
        correctAnswer: string;
    } {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return JSON.parse(jsonText) as {
            content: string;
            options: Array<{ label: string; value: string }>;
            correctAnswer: string;
        };
    }

    /**
     * Generate question asking for source text (answer is target)
     */
    private async generateSourceQuestion(
        vocab: VocabWithTextTargets,
    ): Promise<MultipleChoiceQuestion> {
        // Randomly select one target text as the correct answer
        const correctTarget =
            vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

        const promptData = {
            questionType: 'source' as const,
            sourceLanguage: vocab.sourceLanguageCode,
            targetLanguage: vocab.targetLanguageCode,
            sourceText: vocab.textSource,
            targetText: correctTarget.textTarget,
            correctAnswer: correctTarget.textTarget,
            correctAnswerLabel: correctTarget.textTarget,
        };

        const parsedResponse = await this.generateQuestionWithPrompt(promptData);

        return {
            correctAnswer: parsedResponse.correctAnswer,
            type: QUESTION_TYPES.TARGET,
            content: parsedResponse.content,
            options: parsedResponse.options,
        };
    }

    /**
     * Generate question asking for target text (answer is source)
     */
    private async generateTargetQuestion(
        vocab: VocabWithTextTargets,
    ): Promise<MultipleChoiceQuestion> {
        // Randomly select one target text
        const selectedTarget =
            vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

        const promptData = {
            questionType: 'target' as const,
            sourceLanguage: vocab.sourceLanguageCode,
            targetLanguage: vocab.targetLanguageCode,
            sourceText: vocab.textSource,
            targetText: selectedTarget.textTarget,
            correctAnswer: vocab.textSource,
            correctAnswerLabel: vocab.textSource,
        };

        const parsedResponse = await this.generateQuestionWithPrompt(promptData);

        return {
            correctAnswer: parsedResponse.correctAnswer,
            type: QUESTION_TYPES.SOURCE,
            content: parsedResponse.content,
            options: parsedResponse.options,
        };
    }
}
