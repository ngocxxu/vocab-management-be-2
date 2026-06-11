import { Injectable } from '@nestjs/common';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/utils';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import { parseJsonOrThrow } from '../utils/ai-json.util';
import { TextTargetRecord, VocabForTextTargets } from '../utils/ai-text-types.util';
import { AI_CONFIG } from '../utils/const.util';
import { MultipleChoiceQuestion } from '../utils/type.util';
import { AiLanguageNameService } from './ai-language-name.service';

type PreparedVocabItem = {
    index: number;
    vocab: VocabForTextTargets;
    questionType: 'source' | 'target';
    selectedTarget: string;
    sourceLanguageName: string;
    targetLanguageName: string;
    correctAnswer: string;
    content: string;
};

@Injectable()
export class AiMultipleChoiceService {
    private static readonly GENERATION_BATCH_SIZE = 3;
    private static readonly PLACEHOLDER_LABEL_PATTERN = /^(?:[A-D]|correct_answer|wrong_option_\d+)$/i;

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageNameService: AiLanguageNameService,
    ) {}

    public async generateMultipleChoiceQuestions(vocabList: VocabWithTextTargets[], userId?: string): Promise<MultipleChoiceQuestion[]> {
        if (vocabList.length === 0) return [];

        const preparedItems = await this.prepareVocabItems(vocabList);
        if (preparedItems.length === 0) {
            return [];
        }

        const questions: MultipleChoiceQuestion[] = [];

        for (let index = 0; index < preparedItems.length; index += AiMultipleChoiceService.GENERATION_BATCH_SIZE) {
            const batchItems = preparedItems.slice(index, index + AiMultipleChoiceService.GENERATION_BATCH_SIZE);
            const batchQuestions = await this.generateBatchQuestions(batchItems, userId);
            questions.push(...batchQuestions);
        }

        return questions;
    }

    private async prepareVocabItems(vocabList: VocabWithTextTargets[]): Promise<PreparedVocabItem[]> {
        const vocabItems: Array<Omit<PreparedVocabItem, 'sourceLanguageName' | 'targetLanguageName' | 'correctAnswer' | 'content'>> = [];

        vocabList.forEach((vocabAny, index) => {
            const vocab = vocabAny as unknown as VocabForTextTargets;
            if (!vocab.textTargets || vocab.textTargets.length === 0) return;

            const isAskingSource = Math.random() < AI_CONFIG.sourceQuestionProbability;
            const textTargets = vocab.textTargets ?? [];
            const selectedTarget = textTargets[Math.floor(Math.random() * textTargets.length)];

            vocabItems.push({
                index,
                vocab,
                questionType: isAskingSource ? 'source' : 'target',
                selectedTarget: selectedTarget?.textTarget ?? '',
            });
        });

        if (vocabItems.length === 0) return [];

        return Promise.all(
            vocabItems.map(async (item) => {
                const sourceLanguageName = await this.languageNameService.getLanguageName(item.vocab.sourceLanguageCode);
                const targetLanguageName = await this.languageNameService.getLanguageName(item.vocab.targetLanguageCode);
                const content =
                    item.questionType === 'source'
                        ? `What is the translation of '${item.vocab.textSource}' in ${targetLanguageName}?`
                        : `What is the translation of '${item.selectedTarget}' in ${sourceLanguageName}?`;
                const correctAnswer = item.questionType === 'source' ? item.selectedTarget : item.vocab.textSource;

                return {
                    ...item,
                    sourceLanguageName,
                    targetLanguageName,
                    correctAnswer,
                    content,
                };
            }),
        );
    }

    private async generateBatchQuestions(vocabItems: PreparedVocabItem[], userId?: string): Promise<MultipleChoiceQuestion[]> {
        if (vocabItems.length === 0) {
            return [];
        }

        const vocabDetails = vocabItems
            .map((item, idx) => {
                const targetTexts = (item.vocab.textTargets ?? []).map((tt: TextTargetRecord) => tt.textTarget).join(', ');
                return JSON.stringify({
                    vocabIndex: idx,
                    source: item.vocab.textSource,
                    targets: targetTexts,
                    questionType: item.questionType === 'source' ? 'textTarget' : 'textSource',
                    content: item.content,
                    correctAnswer: item.correctAnswer,
                    sourceLanguage: item.sourceLanguageName,
                    targetLanguage: item.targetLanguageName,
                });
            })
            .join('\n');

        const prompt = `
Return a JSON array only.
Generate ${vocabItems.length} multiple choice questions from the items below.
Each item already contains the exact question content, type, and correct answer.
Use exactly ${AI_CONFIG.questionCount} options per question.
Each option must be a real answer string, not letters, placeholders, tags, XML, or variables.
Do not use values like A/B/C/D, correct_answer, wrong_option_1, or <...>.
Each option object must use the answer text for both "label" and "value".

Items:
${vocabDetails}

Required output shape:
[
  {
    "vocabIndex": 0,
    "type": "textTarget",
    "content": "question text",
    "options": [
      {"label": "answer text", "value": "answer text"}
    ],
    "correctAnswer": "answer text"
  }
]

Return JSON only. No prose. No markdown. No comments.
`;

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
                const normalizedOptions = item.options.map((option) => this.normalizeOption(option));
                const shuffledOptions = shuffleArray(normalizedOptions);

                questions.push({
                    correctAnswer: item.correctAnswer,
                    type: item.type as 'textSource' | 'textTarget',
                    content: item.content,
                    options: shuffledOptions,
                });
            }
        });

        return questions;
    }

    private normalizeOption(option: { label: string; value: string }): { label: string; value: string } {
        const trimmedValue = option.value.trim();
        const trimmedLabel = option.label.trim();

        if (trimmedValue.length === 0) {
            return {
                label: trimmedLabel,
                value: trimmedLabel,
            };
        }

        if (AiMultipleChoiceService.PLACEHOLDER_LABEL_PATTERN.test(trimmedLabel)) {
            return {
                label: trimmedValue,
                value: trimmedValue,
            };
        }

        return {
            label: trimmedLabel,
            value: trimmedValue,
        };
    }
}
