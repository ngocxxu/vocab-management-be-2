import { Injectable, Logger } from '@nestjs/common';
import { AiProviderFactory } from '../provider/ai-provider.factory';
import { parseJsonOrThrow } from '../util/ai-json.util';
import { AI_CONFIG } from '../util/const.util';
import { EvaluationResult } from '../util/type.util';
import { AiLanguageNameService } from './ai-language-name.service';
import { EvaluateTranslationParams } from '../util/ai-service-types.util';

@Injectable()
export class AiTranslationEvaluationService {
    private readonly logger = new Logger(AiTranslationEvaluationService.name);

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageNameService: AiLanguageNameService,
    ) {}

    public async evaluateTranslation(params: EvaluateTranslationParams): Promise<EvaluationResult> {
        const {
            targetDialogue,
            transcript,
            sourceLanguageCode,
            targetLanguageCode,
            sourceWords,
            targetStyle,
            targetAudience,
            userId,
            retryCount = 0,
        } = params;

        try {
            const sourceLanguage =
                await this.languageNameService.getLanguageName(sourceLanguageCode);
            const targetLanguage =
                await this.languageNameService.getLanguageName(targetLanguageCode);

            const dialogueText = targetDialogue
                .map((item) => `${item.speaker}: "${item.text}"`)
                .join('\n');

            const sourceWordsList = sourceWords.join(', ');
            const styleContext = targetStyle ? `target style = ${targetStyle}` : '';
            const audienceContext = targetAudience ? `target audience = ${targetAudience}` : '';
            const context = [styleContext, audienceContext].filter(Boolean).join(', ');

            const prompt = `
You are a strict evaluator for translation quality between ${targetLanguage} → ${sourceLanguage}. 
You must follow STRICT SCORING RULES and NEVER give generous scores.

Your job:
- Compare the user's ${sourceLanguage} translation (ASR transcript) against the original ${targetLanguage} dialogue.
- Detect any missing meaning, added meaning, mistranslation, incorrect register, grammar issues, or incorrect tense.
- CRITICALLY IMPORTANT: The user's translation MUST use the source words or their synonyms: ${sourceWordsList}
- Penalize SEVERELY if the user does not use the required source words or their synonyms
- Penalize SEVERELY for omissions, additions, or incorrect interpretation of meaning.

Scoring rules (VERY STRICT):
- accuracy = 10 only if semantic meaning aligns ≥ 95% AND the required source words (or synonyms) are used.
- Every missing key idea = -2 points.
- Every mistranslation of critical meaning = -2 to -3 points.
- Every invented meaning (addition) = -3 points.
- If required source words are not used (or their synonyms), deduct -3 to -5 points from accuracy.
- completeness = proportional to meaning coverage:
   completeness = round( (covered_meaning_percent) / 10 )
- fluency = evaluate grammar, naturalness, cohesion.
- register = evaluate tone, formality, appropriateness.

overallScore:
- Automatically computed as:
  overallScore = accuracy*2.5 + fluency*2 + register*1.5 + completeness*4
- Clamp 0–100.

Return ONLY JSON with structure:
{
  "overallScore": number,
  "scores": { "accuracy": number, "fluency": number, "register": number, "completeness": number },
  "errors": [
    {
      "index": number,
      "span": "text fragment",
      "type": "omission | addition | wrong_lex | tense | register",
      "explanation": "what is wrong and why",
      "suggestion": "corrected version"
    }
  ],
  "missingIdeas": [ "list each missing idea from source dialogue" ],
  "correctedTranslation": "Full corrected translation in ${sourceLanguage}",
  "advice": ["strict actionable improvements"]
}

Source dialogue (${targetLanguage}):
${dialogueText}

User ASR transcript (${sourceLanguage}):
"${transcript}"

Required source words (or synonyms) that MUST be used: ${sourceWordsList}

${context ? `Context: ${context}` : ''}
            `;

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            return parseJsonOrThrow<EvaluationResult>(text);
        } catch (error) {
            this.logger.error(`Error evaluating translation (attempt ${retryCount + 1}):`, error);

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn('Retrying translation evaluation...');
                await new Promise((resolve) =>
                    setTimeout(resolve, AI_CONFIG.retryDelayMs * (retryCount + 1)),
                );
                return this.evaluateTranslation({ ...params, retryCount: retryCount + 1 });
            }

            throw error;
        }
    }

    public formatMarkdownReport(evaluation: EvaluationResult, transcript: string): string {
        const safe = <T, U>(v: T | undefined, d: U) => v ?? (d as unknown as T);

        let report = '# Translation Evaluation Report\n\n';
        report += `## Overall Score: ${safe(evaluation.overallScore, 0)} / 100\n\n`;
        report += '### Detailed Scores (scale 0–10)\n';
        report += `- **Accuracy**: ${safe(evaluation.scores?.accuracy, 0)}/10 — Semantic correctness (penalize omissions/additions). \n`;
        report += `- **Fluency**: ${safe(evaluation.scores?.fluency, 0)}/10 — Naturalness, grammar, cohesion.\n`;
        report += `- **Register**: ${safe(evaluation.scores?.register, 0)}/10 — Tone / formality appropriateness.\n`;
        report += `- **Completeness**: ${safe(evaluation.scores?.completeness, 0)}/10 — Coverage of source ideas (computed from meaning coverage %).\n\n`;

        report += '### Scoring Formula\n';
        report +=
            'OverallScore = accuracy * 2.5 + fluency * 2 + register * 1.5 + completeness * 4 (clamped 0–100)\n\n';

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

        report += '## Your Transcript (ASR)\n\n';
        report += `${transcript || '(no transcript)'}\n\n`;

        report += '## Corrected Translation (full)\n\n';
        report += `${safe(evaluation.correctedTranslation, '(no corrected translation)')}\n\n`;

        const missing = safe(evaluation.missingIdeas, []);
        if (Array.isArray(missing) && missing.length > 0) {
            report +=
                '## Missing Ideas (explicit list of source ideas not covered by the transcript)\n\n';
            missing.forEach((mi, i) => {
                report += `${i + 1}. ${mi}\n`;
            });
            report += '\n';
        }

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
}
