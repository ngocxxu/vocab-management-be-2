import { AiProviderFactory } from '@/domains/ai/providers/ai-provider.factory';
import { parseJsonOrThrow } from '@/domains/ai/utils/ai-json.util';
import { Injectable, Logger } from '@nestjs/common';
import { normalizeSubjectName } from '../utils';

@Injectable()
export class AiSubjectService {
    private readonly logger = new Logger(AiSubjectService.name);

    public constructor(private readonly providerFactory: AiProviderFactory) {}

    public async suggestSubjects(textTarget: string, targetLanguageCode: string, userId?: string): Promise<string[]> {
        const prompt = this.buildPrompt(textTarget, targetLanguageCode);

        try {
            const provider = await this.providerFactory.getProvider(userId);
            const raw = await provider.generateContent(prompt, userId);
            const parsed = parseJsonOrThrow<unknown>(raw);

            if (!Array.isArray(parsed)) {
                this.logger.warn(`AI returned non-array for subject suggestions: ${typeof parsed}`);
                return [];
            }

            return (parsed as unknown[])
                .filter((item): item is string => typeof item === 'string' && item.trim().length >= 2)
                .map((name) => normalizeSubjectName(name))
                .filter((name) => name.length >= 2)
                .slice(0, 5);
        } catch (error) {
            this.logger.error(`Failed to generate subject suggestions for "${textTarget}":`, error);
            return [];
        }
    }

    private buildPrompt(textTarget: string, targetLanguageCode: string): string {
        return `You are a vocabulary categorization expert.

Your task: Given a word or phrase in language "${targetLanguageCode}", suggest exactly 5 relevant subject/category names for vocabulary learning.

Word: "${textTarget}"
Language code: ${targetLanguageCode}

Steps:
1. Identify what "${textTarget}" means in ${targetLanguageCode}.
2. Based on that meaning, think of 5 specific vocabulary learning categories this word belongs to.

Rules for categories:
- Write all category names in ${targetLanguageCode}
- Short and specific (1-3 words)
- Concrete domains only — no vague abstractions like "Things", "General", "Misc"
- Think: animal types, body parts, professions, nature, technology, food, emotions, etc.

After your reasoning, output ONLY a JSON array of exactly 5 strings. No markdown, no code blocks:
["...", "...", "...", "...", "..."]`;
    }
}
