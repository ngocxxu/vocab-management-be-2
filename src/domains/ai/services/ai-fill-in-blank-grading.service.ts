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
You are an expert linguistic evaluator. Your task is to assess student translations with semantic flexibility, avoiding rigid string matching.
If you mention a spelling/character mismatch, do NOT output cryptic tokens. Describe the mismatch clearly.

Input Data:
${evaluationDetails}

CRITICAL EVALUATION RULES:

1. **Normalization (Fix for formatting errors)**:
   - Treat strings as Unicode text; normalize before comparing.
   - Before comparing, ignore all case sensitivity (uppercase/lowercase).
   - LEADING/TRAILING WHITESPACE or extra spaces between words must be IGNORED.
   - Punctuation differences should be ignored unless they change the meaning.
   - *Logic:* If the student's text is identical to the target text after trimming spaces and lowercase conversion, mark it TRUE.

2. **Source-Based Validation (Fix for synonyms)**:
   - Evaluate the relationship between the **Student's Answer** and the **Source Word** directly.
   - If the student's answer is a valid, natural translation or a close synonym of the Source Word (even if not listed in the "Target word(s)"), mark it TRUE.

3. **Multi-Value & Partial Match (Crucial for Vocabulary)**:
   - When the "Target word(s)" or "Correct answer" contains multiple meanings separated by commas:
     - **ONE OF MANY:** correct if student provides ANY ONE meaning.
     - **ALL:** correct if student provides ALL meanings.
     - **SYNONYM:** correct if student provides a valid synonym for ANY meaning.

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no code blocks.
Explanation must be in Vietnamese.

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
