import { VocabTrainerBadRequestException } from '@/domains/vocab-trainer/exceptions';
import { assertValidTrainerCreate } from '@/domains/vocab-trainer/utils/fsrs-trainer-rules';
import { FsrsDirection, TrainerMode } from '@prisma/client';

describe('assertValidTrainerCreate: Random direction', () => {
    test('Random alone is a valid set of directions', () => {
        // Act + Assert
        expect(() => assertValidTrainerCreate({ mode: TrainerMode.FSRS, fsrsDirections: [FsrsDirection.RANDOM] })).not.toThrow();
    });

    test('Random cannot be combined with Recognise or Recall', () => {
        // Act + Assert
        expect(() => assertValidTrainerCreate({ mode: TrainerMode.FSRS, fsrsDirections: [FsrsDirection.RANDOM, FsrsDirection.SOURCE_TO_TARGET] })).toThrow(
            VocabTrainerBadRequestException,
        );
    });
});
