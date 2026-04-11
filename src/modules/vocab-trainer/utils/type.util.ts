import { Prisma, VocabTrainer } from '@prisma/client';

export enum EQuestionType {
    MULTIPLE_CHOICE = 'multiple-choice',
    FLIP_CARD = 'flip-card',
    FILL_IN_THE_BLANK = 'fill-in-blank',
    MATCHING = 'matching',
    TRUE_OR_FALSE = 'true-or-false',
    SHORT_ANSWER = 'short-answer',
    TRANSLATION_AUDIO = 'translation-audio',
}

export enum EReminderRepeat {
    MAX_REPEAT = 6,
}

// Type for VocabTrainerWord with vocab relation
export type VocabTrainerWordWithVocab = Prisma.VocabTrainerWordGetPayload<{
    include: { vocab: true };
}>;

export type VocabTrainerWordWithVocabAndTextTargets = Prisma.VocabTrainerWordGetPayload<{
    include: { vocab: { include: { textTargets: true } } };
}>;

export type VocabWithTextTargets = Prisma.VocabGetPayload<{
    include: { textTargets: true };
}>;

// Type for VocabTrainer with vocabAssignments and nested vocab
export type VocabTrainerWithAssignments = Prisma.VocabTrainerGetPayload<{
    include: {
        vocabAssignments: {
            include: {
                vocab: true;
            };
        };
    };
}>;

// If you need textTargets in vocab
export type VocabTrainerFullRelations = Prisma.VocabTrainerGetPayload<{
    include: {
        vocabAssignments: {
            include: {
                vocab: {
                    include: {
                        textTargets: true;
                    };
                };
            };
        };
    };
}>;

export interface QuestionAnswer {
    vocabId: string;
    systemSelected: string;
}

export interface WordTestSelect {
    userSelected: string;
    systemSelected: string;
}

export interface EvaluateResult {
    createResults: Prisma.VocabTrainerResultCreateManyInput[];
    correctAnswers: number;
}

export type VocabTrainerWithTypedAnswers = Omit<VocabTrainer, 'questionAnswers'> & {
    questionAnswers: QuestionAnswer[];
};
