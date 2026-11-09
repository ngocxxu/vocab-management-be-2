export interface AnswerOption {
    label: string;
    value: string;
}

/** Labels the model uses instead of real text: A-D, correct_answer, wrong_option_N. */
const PLACEHOLDER_LABEL_PATTERN = /^(?:[A-D]|correct_answer|wrong_option_\d+)$/i;

/**
 * Makes a model-generated option usable: trims it, fills a missing value from the label,
 * and replaces a placeholder label with the real value.
 */
export function normalizeAnswerOption(option: AnswerOption): AnswerOption {
    const trimmedValue = option.value.trim();
    const trimmedLabel = option.label.trim();

    if (trimmedValue.length === 0) {
        return { label: trimmedLabel, value: trimmedLabel };
    }

    if (PLACEHOLDER_LABEL_PATTERN.test(trimmedLabel)) {
        return { label: trimmedValue, value: trimmedValue };
    }

    return { label: trimmedLabel, value: trimmedValue };
}

/** True when the correct answer (trimmed) equals one of the option values. */
export function hasCorrectAnswerInOptions(correctAnswer: string, options: AnswerOption[]): boolean {
    const target = correctAnswer.trim();
    return options.some((option) => option.value.trim() === target);
}
