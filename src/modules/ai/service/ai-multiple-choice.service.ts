import { Injectable, Logger } from '@nestjs/common';
import { AiProviderFactory } from '../provider/ai-provider.factory';
import { AI_CONFIG } from '../util/const.util';
import { MultipleChoiceQuestion } from '../util/type.util';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/util';
import { parseJsonOrThrow } from '../util/ai-json.util';
import { AiLanguageNameService } from './ai-language-name.service';
import { TextTargetRecord, VocabForTextTargets } from '../util/ai-text-types.util';

@Injectable()
export class AiMultipleChoiceService {
    private readonly logger = new Logger(AiMultipleChoiceService.name);

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageNameService: AiLanguageNameService,
    ) {}

    public async generateMultipleChoiceQuestions(
        vocabList: VocabWithTextTargets[],
        userId?: string,
    ): Promise<MultipleChoiceQuestion[]> {
        if (vocabList.length === 0) return [];
        return this.generateAllQuestionsInBatch(vocabList, userId);
    }

    private async generateAllQuestionsInBatch(
        vocabList: VocabWithTextTargets[],
        userId?: string,
    ): Promise<MultipleChoiceQuestion[]> {
        const vocabItems: Array<{
            index: number;
            vocab: unknown;
            questionType: 'source' | 'target';
            selectedTarget?: string;
        }> = [];

        vocabList.forEach((vocabAny, index) => {
            const vocab = vocabAny as unknown as VocabForTextTargets;
            if (!vocab.textTargets || vocab.textTargets.length === 0) return;

            const isAskingSource = Math.random() < AI_CONFIG.sourceQuestionProbability;
            const textTargets = vocab.textTargets ?? [];
            const selectedTarget = textTargets[Math.floor(Math.random() * textTargets.length)];

            vocabItems.push({
                index,
                vocab: vocabAny,
                questionType: isAskingSource ? 'source' : 'target',
                selectedTarget: selectedTarget?.textTarget ?? '',
            });
        });

        if (vocabItems.length === 0) return [];

        const vocabDetailsPromises = vocabItems.map(async (item, idx) => {
            const vocab = item.vocab as VocabForTextTargets;
            const textTargets = (vocab.textTargets ?? []) as TextTargetRecord[];
            const targetTexts = textTargets.map((tt: TextTargetRecord) => tt.textTarget).join(', ');
            const sourceLanguageName = await this.languageNameService.getLanguageName(
                vocab.sourceLanguageCode,
            );
            const targetLanguageName = await this.languageNameService.getLanguageName(
                vocab.targetLanguageCode,
            );
            const questionDirection =
                item.questionType === 'source'
                    ? `What is the translation of "${vocab.textSource}" in ${targetLanguageName}?`
                    : `What is the translation of "${item.selectedTarget}" in ${sourceLanguageName}?`;
            const correctAnswer =
                item.questionType === 'source' ? item.selectedTarget : vocab.textSource;

            return (
                `${idx + 1}. Source: "${vocab.textSource}", Target(s): "${targetTexts}", ` +
                `Languages: ${sourceLanguageName} → ${targetLanguageName}, ` +
                `Question: ${questionDirection}, Correct Answer: "${correctAnswer}"`
            );
        });

        const vocabDetails = (await Promise.all(vocabDetailsPromises)).join('\n');

        const prompt = `
You are a language learning assistant. Generate multiple choice questions for vocabulary practice.

Vocabulary items:
${vocabDetails}

Task: Create exactly ${vocabItems.length} multiple choice questions, one for each vocabulary item above.

Requirements for each question:
1. The question should ask for the translation as specified
2. Provide exactly ${AI_CONFIG.questionCount} options (A, B, C, D)
3. One option must be the correct answer as specified
4. Generate ${AI_CONFIG.questionCount - 1} plausible but incorrect options that are:
   - Similar length to the correct answer
   - Related to the same topic/context
   - Common words in the target language
   - Not obviously wrong

For each question, determine the question type:
- If question asks "What is the translation of [source] in [target language]?" → type should be "textTarget"
- If question asks "What is the translation of [target] in [source language]?" → type should be "textSource"

Format your response as JSON array:
[
  {
    "vocabIndex": 0,
    "type": "textTarget" or "textSource",
    "content": "What is the translation of 'word1' in Vietnamese?",
    "options": [
      {"label": "correct_answer", "value": "correct_answer"},
      {"label": "wrong_option_1", "value": "wrong_option_1"},
      {"label": "wrong_option_2", "value": "wrong_option_2"},
      {"label": "wrong_option_3", "value": "wrong_option_3"}
    ],
    "correctAnswer": "correct_answer"
  }
]

Return ONLY the JSON array, no markdown formatting, no code blocks, no additional text.
`;

        try {
            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const batchResponse = parseJsonOrThrow<
                Array<{
                    vocabIndex: number;
                    type: string;
                    content: string;
                    options: Array<{ label: string; value: string }>;
                    correctAnswer: string;
                }>
            >(text);

            const questions: MultipleChoiceQuestion[] = [];
            batchResponse.forEach((item) => {
                if (item.vocabIndex >= 0 && item.vocabIndex < vocabItems.length) {
                    const shuffledOptions = shuffleArray(item.options);

                    questions.push({
                        correctAnswer: item.correctAnswer,
                        type: item.type as 'textSource' | 'textTarget',
                        content: item.content,
                        options: shuffledOptions,
                    });
                }
            });

            return questions;
        } catch (error) {
            this.logger.error('Error generating multiple choice questions:', error);
            throw error;
        }
    }
}

