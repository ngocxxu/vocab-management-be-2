import { LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { VocabWithTextTargets } from '../../vocab-trainer/utils';
import { AiGenerationException } from '../exceptions';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import { unwrapItems } from '../utils/ai-items.util';
import { parseJsonOrThrow } from '../utils/ai-json.util';
import { VocabForTextTargets } from '../utils/ai-text-types.util';
import { buildChoiceQuestions, isAiChoiceItem } from '../utils/choice-question.util';
import { AI_CONFIG } from '../utils/const.util';
import { MultipleChoiceQuestion } from '../utils/type.util';
import { AiLanguageNameService } from './ai-language-name.service';

type PreparedGapItem = {
    correctAnswer: string;
    languageName: string;
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

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageNameService: AiLanguageNameService,
        private readonly logger: LoggerService,
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

        // An empty exam must fail the job, not be saved as a finished exam with no questions
        if (questions.length === 0) {
            throw new AiGenerationException('AI returned no usable fill-in-the-blank questions');
        }

        return questions;
    }

    private async prepareVocabItems(vocabList: VocabWithTextTargets[]): Promise<PreparedGapItem[]> {
        const vocabs = vocabList as unknown as VocabForTextTargets[];

        return Promise.all(
            vocabs.map(async (vocab) => {
                const languageName = await this.languageNameService.getLanguageName(vocab.sourceLanguageCode);

                return {
                    correctAnswer: vocab.textSource,
                    languageName,
                };
            }),
        );
    }

    private async generateBatchQuestions(vocabItems: PreparedGapItem[], userId?: string): Promise<MultipleChoiceQuestion[]> {
        if (vocabItems.length === 0) {
            return [];
        }

        const vocabDetails = vocabItems
            .map((item, idx) =>
                JSON.stringify({
                    vocabIndex: idx,
                    correctAnswer: item.correctAnswer,
                    language: item.languageName,
                }),
            )
            .join('\n');

        const prompt = `
Return a JSON object only, with the array under the "items" key.
Generate ${vocabItems.length} fill-in-the-blank (cloze) multiple choice questions from the items below.
For each item, write ONE natural, meaningful sentence in "language" that uses "correctAnswer" in context,
then replace exactly that word/phrase with the placeholder "${AiFillInBlankChoiceService.GAP_PLACEHOLDER}".
The sentence in "content" MUST contain the placeholder "${AiFillInBlankChoiceService.GAP_PLACEHOLDER}" exactly once.
Provide exactly ${AI_CONFIG.questionCount} options per question: the correct answer plus plausible wrong words in the SAME language.
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
{ "items": [
  {
    "vocabIndex": 0,
    "content": "sentence with a ${AiFillInBlankChoiceService.GAP_PLACEHOLDER} gap",
    "options": [
      {"label": "answer text", "value": "answer text"}
    ],
    "correctAnswer": "answer text"
  }
]}

Return JSON only. No prose. No markdown. No comments.
`;

        const provider = await this.providerFactory.getProvider(userId);
        const text = await provider.generateContent(prompt, userId, { json: true });

        const batchResponse = unwrapItems(parseJsonOrThrow<unknown>(text), isAiChoiceItem);
        const { questions, droppedQuestions } = buildChoiceQuestions(batchResponse, vocabItems.length);
        droppedQuestions.forEach(({ vocabIndex, reason }) => {
            this.logger.warn(`Dropped choice question for vocabIndex ${vocabIndex}: ${reason}`);
        });

        return questions.map(
            (question): MultipleChoiceQuestion => ({
                correctAnswer: question.correctAnswer,
                type: 'textSource',
                content: question.content,
                options: question.options,
            }),
        );
    }
}
