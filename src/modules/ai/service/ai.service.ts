import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/util';

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
    ): Promise<MultipleChoiceQuestion | null> {
        try {
            // Randomly choose whether to ask about source or target
            const isAskingSource = Math.random() < 0.5;

            if (isAskingSource) {
                return await this.generateSourceQuestion(vocab);
            } else {
                return await this.generateTargetQuestion(vocab);
            }
        } catch (error) {
            this.logger.error(`Error generating question for vocab ${vocab.id}:`, error);
            return null;
        }
    }

    /**
     * Generate question asking for source text (answer is target)
     */
    private async generateSourceQuestion(
        vocab: VocabWithTextTargets,
    ): Promise<MultipleChoiceQuestion> {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Randomly select one target text as the correct answer
        const correctTarget =
            vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

        const prompt = `
You are a language learning assistant. Generate a multiple choice question for vocabulary practice.

Context:
- Source language: ${vocab.sourceLanguageCode}
- Target language: ${vocab.targetLanguageCode}
- Source text: "${vocab.textSource}"
- Target text (correct answer): "${correctTarget.textTarget}"

Task: Create a question asking "What is the translation of '[source_text]' in [target_language]?"

Requirements:
1. The question should ask for the translation of the source text
2. Provide 4 options (A, B, C, D)
3. One option should be the correct target text: "${correctTarget.textTarget}"
4. Generate 3 plausible but incorrect options that are:
   - Similar length to the correct answer
   - Related to the same topic/context
   - Common words in the target language
   - Not obviously wrong

Format your response as JSON:
{
    "content": "What is the translation of '[source_text]' in [target_language]?",
    "options": [
        {"label": "${correctTarget.textTarget}", "value": "${correctTarget.textTarget}"},
        {"label": "wrong_option_1", "value": "wrong_option_1"},
        {"label": "wrong_option_2", "value": "wrong_option_2"},
        {"label": "wrong_option_3", "value": "wrong_option_3"}
    ],
    correctAnswer: "${correctTarget.textTarget}"
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Parse JSON response - handle markdown code blocks
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsedResponse = JSON.parse(jsonText) as {
            content: string;
            options: Array<{ label: string; value: string }>;
            correctAnswer: string;
        };

        // Shuffle options to randomize correct answer position
        const shuffledOptions = shuffleArray(parsedResponse.options);

        return {
            correctAnswer: parsedResponse.correctAnswer,
            type: 'textTarget',
            content: parsedResponse.content,
            options: shuffledOptions,
        };
    }

    /**
     * Generate question asking for target text (answer is source)
     */
    private async generateTargetQuestion(
        vocab: VocabWithTextTargets,
    ): Promise<MultipleChoiceQuestion> {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Randomly select one target text
        const selectedTarget =
            vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

        const prompt = `
You are a language learning assistant. Generate a multiple choice question for vocabulary practice.

Context:
- Source language: ${vocab.sourceLanguageCode}
- Target language: ${vocab.targetLanguageCode}
- Source text (correct answer): "${vocab.textSource}"
- Target text: "${selectedTarget.textTarget}"

Task: Create a question asking "What is the translation of '[target_text]' in [source_language]?"

Requirements:
1. The question should ask for the translation of the target text
2. Provide 4 options (A, B, C, D)
3. One option should be the correct source text: "${vocab.textSource}"
4. Generate 3 plausible but incorrect options that are:
   - Similar length to the correct answer
   - Related to the same topic/context
   - Common words in the source language
   - Not obviously wrong

Format your response as JSON:
{
    "content": "What is the translation of '[target_text]' in [source_language]?",
    "options": [
        {"label": "${vocab.textSource}", "value": "${vocab.textSource}"},
        {"label": "wrong_option_1", "value": "wrong_option_1"},
        {"label": "wrong_option_2", "value": "wrong_option_2"},
        {"label": "wrong_option_3", "value": "wrong_option_3"}
    ],
    correctAnswer: "${vocab.textSource}"
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Parse JSON response - handle markdown code blocks
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsedResponse = JSON.parse(jsonText) as {
            content: string;
            options: Array<{ label: string; value: string }>;
            correctAnswer: string;
        };

        // Shuffle options to randomize correct answer position
        const shuffledOptions = shuffleArray(parsedResponse.options);

        return {
            correctAnswer: parsedResponse.correctAnswer,
            type: 'textSource',
            content: parsedResponse.content,
            options: shuffledOptions,
        };
    }
}
