import { Injectable } from '@nestjs/common';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/utils';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import { parseJsonOrThrow } from '../utils/ai-json.util';
import { TextTargetRecord, VocabForTextTargets } from '../utils/ai-text-types.util';
import { AI_CONFIG } from '../utils/const.util';
import { MultipleChoiceQuestion } from '../utils/type.util';
import { AiLanguageNameService } from './ai-language-name.service';

type PreparedGapItem = {
    index: number;
    vocab: VocabForTextTargets;
    questionType: 'source' | 'target';
    selectedTarget: string;
    sourceLanguageName: string;
    targetLanguageName: string;
    correctAnswer: string;
    answerLanguageName: string;
};

/**
 * Generates "fill in the blank" multiple choice (cloze) questions:
 * AI produces a natural sentence containing a `___` gap plus 4 answer options,
 * the user picks the option that fills the gap. Scored locally like multiple choice.
 */
@Injectable()
export class AiFillInBlankChoiceService {
    private static readonly GENERATION_BATCH_SIZE = 3;
    private static readonly GAP_PLACEHOLDER = '___';
    private static readonly PLACEHOLDER_LABEL_PATTERN = /^(?:[A-D]|correct_answer|wrong_option_\d+)$/i;

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageNameService: AiLanguageNameService,
    ) {}

    public async generateFillInBlankChoiceQuestions(vocabList: VocabWithTextTargets[], userId?: string): Promise<MultipleChoiceQuestion[]> {
        if (vocabList.length === 0) return [];

        const preparedItems = await this.prepareVocabItems(vocabList);
        if (preparedItems.length === 0) {
            return [];
        }

        const questions: MultipleChoiceQuestion[] = [];

        for (let index = 0; index < preparedItems.length; index += AiFillInBlankChoiceService.GENERATION_BATCH_SIZE) {
            const batchItems = preparedItems.slice(index, index + AiFillInBlankChoiceService.GENERATION_BATCH_SIZE);
            const batchQuestions = await this.generateBatchQuestions(batchItems, userId);
            questions.push(...batchQuestions);
        }

        return questions;
    }

    private async prepareVocabItems(vocabList: VocabWithTextTargets[]): Promise<PreparedGapItem[]> {
        const vocabItems: Array<Omit<PreparedGapItem, 'sourceLanguageName' | 'targetLanguageName' | 'correctAnswer' | 'answerLanguageName'>> = [];

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
                // question asks "source" => answer is the target translation; asks "target" => answer is the source word.
                const correctAnswer = item.questionType === 'source' ? item.selectedTarget : item.vocab.textSource;
                const answerLanguageName = item.questionType === 'source' ? targetLanguageName : sourceLanguageName;

                return {
                    ...item,
                    sourceLanguageName,
                    targetLanguageName,
                    correctAnswer,
                    answerLanguageName,
                };
            }),
        );
    }

    private async generateBatchQuestions(vocabItems: PreparedGapItem[], userId?: string): Promise<MultipleChoiceQuestion[]> {
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
                    correctAnswer: item.correctAnswer,
                    answerLanguage: item.answerLanguageName,
                    sourceLanguage: item.sourceLanguageName,
                    targetLanguage: item.targetLanguageName,
                });
            })
            .join('\n');

        const prompt = `
Return a JSON array only.
Generate ${vocabItems.length} fill-in-the-blank (cloze) multiple choice questions from the items below.
For each item, write ONE natural, meaningful sentence in the answer language that uses "correctAnswer" in context,
then replace exactly that word/phrase with the placeholder "${AiFillInBlankChoiceService.GAP_PLACEHOLDER}".
The sentence in "content" MUST contain the placeholder "${AiFillInBlankChoiceService.GAP_PLACEHOLDER}" exactly once.
Provide exactly ${AI_CONFIG.questionCount} options per question: the correct answer plus plausible wrong words in the SAME answer language.
Each option must be a real answer string, not letters, placeholders, tags, XML, or variables.
Do not use values like A/B/C/D, correct_answer, wrong_option_1, or <...>.
Each option object must use the answer text for both "label" and "value".
"correctAnswer" must be exactly equal to one option value and must fill the "${AiFillInBlankChoiceService.GAP_PLACEHOLDER}" naturally.
The answer word/phrase must appear ONLY at the "${AiFillInBlankChoiceService.GAP_PLACEHOLDER}" gap, never elsewhere in the sentence.
The sentence context must make "correctAnswer" the ONLY correct fit; every wrong option must be clearly incorrect in that
specific sentence (wrong meaning, wrong grammar, or contradicting the context) — not just generically plausible.
Prefer a sentence with enough specific context to rule out every wrong option, not a generic sentence many words could complete.

Items:
${vocabDetails}

Required output shape:
[
  {
    "vocabIndex": 0,
    "type": "textTarget",
    "content": "sentence with a ${AiFillInBlankChoiceService.GAP_PLACEHOLDER} gap",
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

        if (AiFillInBlankChoiceService.PLACEHOLDER_LABEL_PATTERN.test(trimmedLabel)) {
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
