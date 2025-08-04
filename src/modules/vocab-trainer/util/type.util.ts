import { Prisma, QuestionType, VocabTrainer, VocabTrainerResult } from '@prisma/client';

export enum EReminderRepeat {
    MAX_REPEAT = 32,
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
    vocabId: string;
    userSelected: string;
    questionType: QuestionType;
}

export interface EvaluateResult {
    wordResults: VocabTrainerResult[];
    createResults: Prisma.VocabTrainerResultCreateManyInput[];
    correctAnswers: number;
}

export type VocabTrainerWithTypedAnswers = Omit<VocabTrainer, 'questionAnswers'> & {
    questionAnswers: QuestionAnswer[];
};
