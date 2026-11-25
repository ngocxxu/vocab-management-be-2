import type { VocabWithTextTargets } from './type.util';

/** One answer of a fill-in-blank submit. `content` is the question text the client sent: display only, never graded (#17). */
export interface FillInBlankAnswer {
    userAnswer: string;
    systemAnswer: string;
    content?: string | null;
}

/** One graded answer of a fill-in-blank submit, as the evaluation job takes it. */
export interface FillInBlankEvaluationItem {
    answerSubmission: FillInBlankAnswer;
    vocab: VocabWithTextTargets;
    answerType: 'textSource' | 'textTarget';
}

/** Trimmed question text. Null when the client sent none, or only spaces. */
export function toQuestionContent(content: string | null | undefined): string | null {
    const trimmed = content?.trim();
    return trimmed ? trimmed : null;
}

/** The answers as the snapshot and the job keep them: one entry per question, with `content` null when absent. */
export function toAnswerSubmissions(answers: FillInBlankAnswer[]): Array<{ userAnswer: string; systemAnswer: string; content: string | null }> {
    return answers.map((answer) => ({
        userAnswer: answer.userAnswer,
        systemAnswer: answer.systemAnswer,
        content: toQuestionContent(answer.content),
    }));
}

/** The evaluations of a fill-in-blank job, one per answer that matched a question. `content` only reaches the stored result. */
export function toFillInBlankEvaluations(items: FillInBlankEvaluationItem[]) {
    return items.map((item) => ({
        vocab: item.vocab,
        userAnswer: item.answerSubmission.userAnswer,
        systemAnswer: item.answerSubmission.systemAnswer,
        questionType: item.answerType,
        vocabId: item.vocab.id,
        content: toQuestionContent(item.answerSubmission.content),
    }));
}
