import { FsrsDirection, QuestionType, TrainerMode, VocabTrainer } from '@prisma/client';
import { VocabTrainerBadRequestException } from '../exceptions';

export const FSRS_MIN_DESIRED_RETENTION = 0.7;
export const FSRS_MAX_DESIRED_RETENTION = 0.97;
export const FSRS_MAX_INTERVAL_DAYS = 36500;

/** The only question types an FSRS trainer can review: flip card (self rating) and typed answer. */
const FSRS_QUESTION_TYPES: QuestionType[] = [QuestionType.FLIP_CARD, QuestionType.FILL_IN_THE_BLANK];

type FsrsInputFields = {
    mode?: TrainerMode;
    questionType?: QuestionType;
    fsrsDesiredRetention?: number;
    fsrsMaximumInterval?: number;
    fsrsNewPerDay?: number | null;
    fsrsDirections?: FsrsDirection[];
    fsrsEndsAt?: Date | null;
};

function hasFsrsSettings(input: FsrsInputFields): boolean {
    const settings = [input.fsrsDesiredRetention, input.fsrsMaximumInterval, input.fsrsNewPerDay, input.fsrsDirections, input.fsrsEndsAt];

    return settings.some((value) => value !== undefined && value !== null);
}

function assertFsrsQuestionType(questionType: QuestionType | undefined): void {
    if (questionType !== undefined && !FSRS_QUESTION_TYPES.includes(questionType)) {
        throw new VocabTrainerBadRequestException(`An FSRS trainer supports only ${FSRS_QUESTION_TYPES.join(' and ')} questions`);
    }
}

/** Random is a choice of its own: one card per word, so it cannot share a trainer with Recognise or Recall cards. */
export function isRandomWithOthers(directions: FsrsDirection[]): boolean {
    return directions.includes(FsrsDirection.RANDOM) && directions.length > 1;
}

function assertRandomIsAlone(directions: FsrsDirection[] | undefined): void {
    if (directions && isRandomWithOthers(directions)) {
        throw new VocabTrainerBadRequestException('Random cannot be combined with another direction');
    }
}

function isSameSet(a: FsrsDirection[], b: FsrsDirection[]): boolean {
    return a.length === b.length && a.every((direction) => b.includes(direction));
}

export function assertValidTrainerCreate(input: FsrsInputFields): void {
    if ((input.mode ?? TrainerMode.CLASSIC) === TrainerMode.CLASSIC) {
        if (hasFsrsSettings(input)) {
            throw new VocabTrainerBadRequestException('FSRS settings need mode FSRS');
        }
        return;
    }

    assertRandomIsAlone(input.fsrsDirections);
    assertFsrsQuestionType(input.questionType);
}

/** `mode` and `fsrsDirections` are fixed at creation: sending the current value again is fine, a different one is not. */
export function assertTrainerUpdateAllowed(input: FsrsInputFields, existing: Pick<VocabTrainer, 'mode' | 'fsrsDirections'>): void {
    if (input.mode !== undefined && input.mode !== existing.mode) {
        throw new VocabTrainerBadRequestException('The mode of a trainer cannot be changed');
    }

    if (existing.mode === TrainerMode.CLASSIC) {
        if (hasFsrsSettings(input)) {
            throw new VocabTrainerBadRequestException('FSRS settings need mode FSRS');
        }
        return;
    }

    if (input.fsrsDirections !== undefined && !isSameSet(input.fsrsDirections, existing.fsrsDirections)) {
        throw new VocabTrainerBadRequestException('The directions of an FSRS trainer cannot be changed');
    }
    assertFsrsQuestionType(input.questionType);
}
