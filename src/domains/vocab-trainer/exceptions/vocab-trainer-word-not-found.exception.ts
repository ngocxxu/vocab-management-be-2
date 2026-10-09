import { NotFoundException } from '@nestjs/common';

/** The word is not part of this trainer (so there is nothing to remove). */
export class VocabTrainerWordNotFoundException extends NotFoundException {
    public constructor(trainerId: string, vocabId: string) {
        super(`Vocab ${vocabId} is not in trainer ${trainerId}`);
    }
}
