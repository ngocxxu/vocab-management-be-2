import { z } from 'zod';

import { MCP_WRITE_LIMITS } from '../constants';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

const vocabExampleInput = z.strictObject({
    source: requiredText(MCP_WRITE_LIMITS.EXAMPLE).describe('Example sentence in the source language'),
    target: requiredText(MCP_WRITE_LIMITS.EXAMPLE).describe('Translation of the example'),
});

/** One meaning of the word: its translation or definition, and the subjects it belongs to. */
export const vocabMeaningInput = z.strictObject({
    text: requiredText(MCP_WRITE_LIMITS.TEXT).describe('Translation or definition, in the target language'),
    wordTypeId: z.string().min(1).optional().describe('Word type id from list_word_types'),
    grammar: optionalText(MCP_WRITE_LIMITS.TEXT).describe('Short grammar note, e.g. "noun, plural"'),
    explanationSource: optionalText(MCP_WRITE_LIMITS.EXPLANATION).describe('Explanation in the source language'),
    explanationTarget: optionalText(MCP_WRITE_LIMITS.EXPLANATION).describe('Explanation in the target language'),
    subjectIds: z
        .array(z.string().min(1))
        .min(1)
        .max(MCP_WRITE_LIMITS.SUBJECTS)
        .refine((ids) => new Set(ids).size === ids.length, { message: 'Each subject id may appear only once.' })
        .describe('Subject ids from list_subjects or create_subject. At least one.'),
    examples: z.array(vocabExampleInput).max(MCP_WRITE_LIMITS.EXAMPLES).optional().describe('Example sentences for this meaning'),
});

export type VocabMeaningInput = z.output<typeof vocabMeaningInput>;

const vocabPayloadShape = {
    textSource: requiredText(MCP_WRITE_LIMITS.TEXT).describe('The word or phrase, in the source language'),
    folderId: z.string().min(1).describe('Language folder id from list_folders. The folder sets the language pair.'),
    meanings: z.array(vocabMeaningInput).min(1).max(MCP_WRITE_LIMITS.MEANINGS).describe('Every meaning of the word'),
};

/** Two meanings with the same text would be one meaning saved twice, so refuse them before the database does. */
function hasUniqueMeaningTexts(input: { meanings: Array<{ text: string }> }): boolean {
    const texts = input.meanings.map((meaning) => meaning.text.toLowerCase());
    return new Set(texts).size === texts.length;
}

const UNIQUE_MEANINGS_ISSUE = { message: 'Each meaning needs its own text.', path: ['meanings'] };

export const addVocabInput = z.strictObject(vocabPayloadShape).refine(hasUniqueMeaningTexts, UNIQUE_MEANINGS_ISSUE);

export const updateVocabInput = z
    .strictObject({ id: z.string().min(1).describe('Vocab id from list_vocab'), ...vocabPayloadShape })
    .refine(hasUniqueMeaningTexts, UNIQUE_MEANINGS_ISSUE);
