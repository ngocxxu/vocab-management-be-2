import { Injectable, Logger } from '@nestjs/common';
import { CreateTextTargetInput } from '../../vocab/dto/vocab.input';
import { WordTypeRepository } from '../../catalog/word-type/repositories';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import { parseJsonOrThrow } from '../utils/ai-json.util';
import { WordTypeRecord } from '../utils/ai-text-types.util';
import { AI_CONFIG } from '../utils/const.util';

@Injectable()
export class AiTranslationService {
    private readonly logger = new Logger(AiTranslationService.name);

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly wordTypeRepository: WordTypeRepository,
    ) {}

    public async translateVocab(
        textSource: string,
        sourceLanguageCode: string,
        targetLanguageCode: string,
        subjectIds?: string[],
        userId?: string,
        retryCount = 0,
    ): Promise<CreateTextTargetInput> {
        try {
            const prompt = await this.buildTranslationPrompt({
                textSource,
                sourceLanguageCode,
                targetLanguageCode,
            });

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const parsedResponse = parseJsonOrThrow<CreateTextTargetInput>(text);

            return {
                ...parsedResponse,
                subjectIds: subjectIds || [],
            };
        } catch (error) {
            this.logger.error(
                `Error translating vocab "${textSource}" (attempt ${retryCount + 1}):`,
                error,
            );

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn(`Retrying translation for "${textSource}"...`);
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1));
                return this.translateVocab(
                    textSource,
                    sourceLanguageCode,
                    targetLanguageCode,
                    subjectIds,
                    userId,
                    retryCount + 1,
                );
            }

            throw error;
        }
    }

    private async buildTranslationPrompt(params: {
        textSource: string;
        sourceLanguageCode: string;
        targetLanguageCode: string;
    }): Promise<string> {
        const { textSource, sourceLanguageCode, targetLanguageCode } = params;

        const allowedWordTypes = (await this.wordTypeRepository.findAll()) as WordTypeRecord[];
        const simplifiedWordTypes = allowedWordTypes.map((wt: WordTypeRecord) => {
            const { id, name, description } = wt;
            return { id, name, description };
        });

        const wordTypeListString = JSON.stringify(simplifiedWordTypes, null, 2);

        return `
You are an expert linguistic API. Translate a vocabulary word from ${sourceLanguageCode} to ${targetLanguageCode} and classify it strictly according to the provided schema.

Input Data:
- Source Text: "${textSource}"
- Source Language: ${sourceLanguageCode}
- Target Language: ${targetLanguageCode}

*** AUTHORIZED WORD TYPES ***
You must classify the "wordType" field using EXACTLY one of the strings from this list:
${wordTypeListString}

Task Requirements:
1. textTarget: The translation in ${targetLanguageCode}.
2. wordType: Select the most accurate 'name' from the Authorized Word Types list above.
3. explanationSource: Brief meaning in ${sourceLanguageCode}.
4. explanationTarget: Brief meaning in ${targetLanguageCode}.
5. vocabExamples: One clear usage example.

Format your response as a JSON object (NO Markdown, NO code blocks):
{
  "textTarget": "translated_word",
  "wordTypeId": "MUST be the exact UUID/ID from the reference list matching the word type",
  "explanationSource": "explanation in source language",
  "explanationTarget": "explanation in target language",
  "vocabExamples": [
    {
      "source": "example sentence with source word",
      "target": "example sentence with translated word"
    }
  ]
}
`;
    }

    private async delay(ms: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
}

