import { shuffleArray } from '../../vocab-trainer/utils';
import { AnswerOption, hasCorrectAnswerInOptions, normalizeAnswerOption } from './answer-option.util';

/** One AI-written choice item, once its shape is checked (see isAiChoiceItem). */
export type AiChoiceItem = {
    vocabIndex: number;
    content: string;
    options: AnswerOption[];
    correctAnswer: string;
    type?: string;
};

/** A question ready to store: its options are trimmed and shuffled. */
export type ChoiceQuestionDraft = Omit<AiChoiceItem, 'vocabIndex'>;

export type DroppedChoiceQuestion = { vocabIndex: number; reason: string };

export type ChoiceBuildResult = { questions: ChoiceQuestionDraft[]; droppedQuestions: DroppedChoiceQuestion[] };

function isAnswerOption(option: unknown): option is AnswerOption {
    if (!option || typeof option !== 'object') return false;
    const candidate = option as Record<string, unknown>;
    return typeof candidate.label === 'string' && typeof candidate.value === 'string';
}

export function isAiChoiceItem(item: unknown): item is AiChoiceItem {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return (
        typeof candidate.vocabIndex === 'number' &&
        typeof candidate.content === 'string' &&
        typeof candidate.correctAnswer === 'string' &&
        (candidate.type === undefined || typeof candidate.type === 'string') &&
        Array.isArray(candidate.options) &&
        (candidate.options as unknown[]).every(isAnswerOption)
    );
}

/**
 * Keeps items that point at a real vocab and whose correct answer is one of the options,
 * then trims and shuffles the options. Items that fail either check are reported, not returned.
 */
export function buildChoiceQuestions(items: AiChoiceItem[], vocabCount: number): ChoiceBuildResult {
    const questions: ChoiceQuestionDraft[] = [];
    const droppedQuestions: DroppedChoiceQuestion[] = [];

    for (const item of items) {
        if (item.vocabIndex < 0 || item.vocabIndex >= vocabCount) {
            droppedQuestions.push({ vocabIndex: item.vocabIndex, reason: 'vocab index out of range' });
            continue;
        }

        const options = item.options.map((option) => normalizeAnswerOption(option));
        if (!hasCorrectAnswerInOptions(item.correctAnswer, options)) {
            droppedQuestions.push({ vocabIndex: item.vocabIndex, reason: 'correct answer is not among options' });
            continue;
        }

        questions.push({ content: item.content, correctAnswer: item.correctAnswer, options: shuffleArray(options), type: item.type });
    }

    return { questions, droppedQuestions };
}
