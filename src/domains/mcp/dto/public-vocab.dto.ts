import { Subject, TextTarget, TextTargetSubject, Vocab, VocabExample, VocabMastery, WordType } from '@prisma/client';

type TextTargetEntity = TextTarget & {
    wordType?: WordType | null;
    vocabExamples?: VocabExample[];
    textTargetSubjects?: Array<TextTargetSubject & { subject?: Subject | null }>;
};

export type VocabEntityWithDetails = Vocab & {
    textTargets?: TextTargetEntity[];
    vocabMasteries?: VocabMastery[];
};

/** One translation or definition, with only the fields a public client needs. */
export class PublicMeaningDto {
    public readonly text: string;
    public readonly grammar: string | null;
    public readonly wordType: string | null;
    public readonly explanationSource: string | null;
    public readonly explanationTarget: string | null;
    public readonly subjects: string[];
    public readonly examples: Array<{ source: string; target: string }>;

    public constructor(entity: TextTargetEntity) {
        this.text = entity.textTarget;
        this.grammar = entity.grammar;
        this.wordType = entity.wordType?.name ?? null;
        this.explanationSource = entity.explanationSource;
        this.explanationTarget = entity.explanationTarget;
        this.subjects = (entity.textTargetSubjects ?? []).flatMap((assignment) => (assignment.subject ? [assignment.subject.name] : []));
        this.examples = (entity.vocabExamples ?? []).map((example) => ({ source: example.source, target: example.target }));
    }
}

/** A vocab item as a public MCP client sees it. No internal ids (user, folder, text target) and no embedding state. */
export class PublicVocabDto {
    public readonly textSource: string;
    public readonly sourceLanguageCode: string;
    public readonly targetLanguageCode: string;
    public readonly masteryScore: number | null;
    public readonly createdAt: string;
    public readonly meanings: PublicMeaningDto[];

    public constructor(entity: VocabEntityWithDetails) {
        this.textSource = entity.textSource;
        this.sourceLanguageCode = entity.sourceLanguageCode;
        this.targetLanguageCode = entity.targetLanguageCode;
        this.masteryScore = entity.vocabMasteries?.[0]?.masteryScore ?? null;
        this.createdAt = new Date(entity.createdAt).toISOString();
        this.meanings = (entity.textTargets ?? []).map((target) => new PublicMeaningDto(target));
    }
}
