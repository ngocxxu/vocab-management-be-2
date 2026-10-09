import { ConflictException } from '@nestjs/common';

export type TVocabInUse = {
    vocabId: string;
    textSource: string;
    trainerCount: number;
    sampleTrainers: Array<{ id: string; name: string }>;
};

/** A vocab that is still part of at least one trainer cannot be deleted; the vocab stays and so does its trainer data. */
export class VocabInUseException extends ConflictException {
    public constructor(blocked: TVocabInUse[]) {
        const trainerCount = blocked.reduce((sum, vocab) => sum + vocab.trainerCount, 0);
        const message =
            blocked.length === 1
                ? `Cannot delete vocab. ${trainerCount} trainers are using it.`
                : `Cannot delete ${blocked.length} vocabs. ${blocked.length} vocabs are in use by trainers.`;

        super({
            message,
            error: 'VocabInUse',
            details: { vocabs: blocked },
        });
    }
}
