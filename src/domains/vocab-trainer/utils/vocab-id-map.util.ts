import { VocabWithTextTargets } from './type.util';

type ChoiceQuestion = {
    vocabId?: string;
    correctAnswer?: string;
    options?: Array<{ label: string; value: string }>;
};

/**
 * Maps every answer text a learner can select (the question's correct answer, its options, and the words of the assigned vocabs)
 * to the vocab it belongs to. Used to store one result row per answered word.
 */
export function buildVocabIdMap(questionAnswers: unknown, vocabAssignments?: Array<{ vocab: VocabWithTextTargets }>): Map<string, string> {
    const vocabIdMap = new Map<string, string>();

    // Try to get vocabId from questionAnswers first
    (questionAnswers as ChoiceQuestion[]).forEach((q) => {
        if (q.vocabId && q.correctAnswer) {
            vocabIdMap.set(q.correctAnswer, q.vocabId);
        }
        // Also map from options if available
        if (q.options) {
            q.options.forEach((opt) => {
                if (q.vocabId) {
                    vocabIdMap.set(opt.value, q.vocabId);
                }
            });
        }
    });

    vocabAssignments?.forEach((assignment) => {
        const vocab = assignment.vocab;
        vocabIdMap.set(vocab.textSource, vocab.id);
        vocab.textTargets?.forEach((tt) => {
            vocabIdMap.set(tt.textTarget, vocab.id);
        });
    });

    return vocabIdMap;
}
