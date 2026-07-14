import { Injectable, Logger } from '@nestjs/common';
import { VocabWithTextTargets } from '../../vocab-trainer/utils';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import { parseJsonOrThrow } from '../utils/ai-json.util';
import { TextTargetRecord, VocabForTextTargets } from '../utils/ai-text-types.util';
import { isObviousTypo, normalizeForCompare } from '../utils/text-normalization.util';
import { AiLanguageNameService } from './ai-language-name.service';

@Injectable()
export class AiFillInBlankGradingService {
    private readonly logger = new Logger(AiFillInBlankGradingService.name);

    private readonly latinScriptLanguageCodes = new Set(['en', 'es', 'fr', 'de', 'it', 'pt', 'vi']);

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageNameService: AiLanguageNameService,
    ) {}

    public async evaluateAllFillInBlankAnswers(
        evaluations: Array<{
            vocab: VocabWithTextTargets;
            userAnswer: string;
            systemAnswer: string;
            questionType: 'textSource' | 'textTarget';
        }>,
        userId?: string,
    ): Promise<Array<{ isCorrect: boolean; explanation?: string }>> {
        if (evaluations.length === 0) return [];

        const results: Array<{ isCorrect: boolean; explanation?: string } | undefined> = Array.from({ length: evaluations.length });

        const llmEvaluations: typeof evaluations = [];
        const llmIndexMap: number[] = [];

        for (let i = 0; i < evaluations.length; i++) {
            const evaluationItem = evaluations[i];
            const vocab = evaluationItem.vocab as unknown as VocabForTextTargets;
            const textTargets = vocab.textTargets ?? [];
            const targetTexts = textTargets.map((tt: TextTargetRecord) => tt.textTarget).join(', ');
            const correctAnswer = evaluationItem.questionType === 'textSource' ? targetTexts : vocab.textSource;

            const answerLanguageCode = evaluationItem.questionType === 'textSource' ? vocab.targetLanguageCode : vocab.sourceLanguageCode;

            const useLowercase = this.latinScriptLanguageCodes.has(answerLanguageCode);
            const userNorm = normalizeForCompare(evaluationItem.userAnswer ?? '', {
                lowercase: useLowercase,
            });
            const correctNorm = normalizeForCompare(correctAnswer ?? '', { lowercase: useLowercase });

            // Tier 1
            if (userNorm && correctNorm && userNorm === correctNorm) {
                results[i] = { isCorrect: true, explanation: 'Correct.' };
                continue;
            }

            // Tier 2
            if (useLowercase && userNorm && correctNorm) {
                const typo = isObviousTypo(userNorm, correctNorm);
                if (typo.isTypo && typo.confidence >= 0.8) {
                    results[i] = {
                        isCorrect: true,
                        explanation: `Near correct (typing error). Correct answer: "${correctAnswer}"`,
                    };
                    continue;
                }
            }

            llmIndexMap.push(i);
            llmEvaluations.push(evaluationItem);
        }

        if (llmEvaluations.length === 0) return results.map((r) => r ?? { isCorrect: false });

        const evaluationDetailsPromises = llmEvaluations.map(async (evaluationItem, idx) => {
            const vocab = evaluationItem.vocab as unknown as VocabForTextTargets;
            const textTargets = vocab.textTargets ?? [];
            const targetTexts = textTargets.map((tt: TextTargetRecord) => tt.textTarget).join(', ');
            const sourceLanguageName = await this.languageNameService.getLanguageName(vocab.sourceLanguageCode);
            const targetLanguageName = await this.languageNameService.getLanguageName(vocab.targetLanguageCode);
            const questionContext =
                evaluationItem.questionType === 'textSource'
                    ? `What is the translation of "${vocab.textSource}" in ${targetLanguageName}?`
                    : `What is the translation of "${evaluationItem.systemAnswer}" in ${sourceLanguageName}?`;
            const correctAnswer = evaluationItem.questionType === 'textSource' ? targetTexts : vocab.textSource;

            return (
                `${idx + 1}. Source language: ${sourceLanguageName}, ` +
                `Target language: ${targetLanguageName}, ` +
                `Source word: "${vocab.textSource}", Target word(s): "${targetTexts}", ` +
                `Question: ${questionContext}, ` +
                `Correct answer (List): "${correctAnswer}", ` +
                `Student's answer: "${evaluationItem.userAnswer}"`
            );
        });

        const evaluationDetails = (await Promise.all(evaluationDetailsPromises)).join('\n\n');

        const prompt = `
You are a supportive language teacher grading vocabulary answers. Your goal is to reward understanding, NOT to test exact spelling or exact wording.

GUIDING PRINCIPLE (most important):
If the student's answer shows they understood the meaning of the word, mark it CORRECT — even if the wording is not identical
to the expected answer, is incomplete, or uses different but valid phrasing. When genuinely unsure, give the student the
benefit of the doubt and lean towards CORRECT. Only mark INCORRECT when the answer is clearly wrong, unrelated, or a different
word entirely.

Input Data:
${evaluationDetails}

EVALUATION RULES:

1. Normalization — ignore surface formatting:
   - Ignore case (uppercase/lowercase).
   - Ignore leading/trailing whitespace and extra spaces between words.
   - Ignore punctuation and diacritic/accent differences unless they change the meaning.

2. Judge meaning against the SOURCE WORD, not against string matching:
   - Accept any valid, natural translation of the source word, including synonyms, near-synonyms, and paraphrases that convey
     the same core meaning — even if not present in "Target word(s)".
   - Minor grammatical differences (article, tense, singular/plural, word form) do NOT make an answer wrong.

3. Multi-value answers (default rule):
   - When "Target word(s)"/"Correct answer" lists several meanings separated by commas, the student is CORRECT if they provide
     ANY ONE valid meaning. They do NOT need to list all of them.

EXAMPLES OF CORRECT (accept these):
   - Expected "happy"; student wrote "glad" or "joyful" → CORRECT (synonym).
   - Expected "to run quickly"; student wrote "run fast" → CORRECT (same meaning, different wording).
   - Expected "beautiful, pretty"; student wrote "pretty" → CORRECT (one of many).
   - Expected "cái ghế"; student wrote "ghế" → CORRECT (core meaning conveyed).

EXAMPLES OF INCORRECT (reject these):
   - Expected "happy"; student wrote "sad" or "table" → INCORRECT (wrong/unrelated meaning).

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no code blocks.
Explanation must be in Vietnamese, short, and encouraging.

[
  { "answerIndex": 0, "isCorrect": true, "explanation": "..." }
]
`;

        try {
            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);
            const batchResponse = parseJsonOrThrow<Array<{ answerIndex: number; isCorrect: boolean; explanation?: string }>>(text);

            llmEvaluations.forEach((_, llmIdx) => {
                const originalIdx = llmIndexMap[llmIdx];
                const responseItem = batchResponse.find((item) => item.answerIndex === llmIdx);
                results[originalIdx] = responseItem ? { isCorrect: responseItem.isCorrect, explanation: responseItem.explanation } : { isCorrect: false };
            });

            return results.map((r) => r ?? { isCorrect: false });
        } catch (error) {
            this.logger.error('Error evaluating fill-in-blank answers in batch:', error);
            throw error;
        }
    }
}
