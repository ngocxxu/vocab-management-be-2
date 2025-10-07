import { TrainerStatus, VocabTrainerResult } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { EvaluateResult, QuestionAnswer, VocabWithTextTargets, WordTestSelect } from './type.util';

export function getRandomElements<T extends { id: string }>(arr: T[], n: number, exclude: T): T[] {
    const filtered = arr.filter((item) => item.id !== exclude.id);
    const shuffled = [...filtered].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
}

// Helper functions
const getRandomTextTarget = (vocab: VocabWithTextTargets): string => {
    if (!vocab.textTargets?.length) return '';
    const randomIndex = Math.floor(Math.random() * vocab.textTargets.length);
    return vocab.textTargets[randomIndex]?.textTarget ?? '';
};

export const createQuestion = (
    vocab: VocabWithTextTargets,
    type: string,
    wrongVocabs: VocabWithTextTargets[],
) => {
    const isSourceType = type === 'source';

    const content = [isSourceType ? vocab.textSource : getRandomTextTarget(vocab)];

    const systemSelected = {
        label: isSourceType ? getRandomTextTarget(vocab) : vocab.textSource,
        value: vocab.id,
    };

    const wrongOptions = wrongVocabs.map((item: VocabWithTextTargets) => ({
        label: isSourceType ? getRandomTextTarget(item) : item.textSource ?? '',
        value: item.id,
    }));

    const options = [systemSelected, ...wrongOptions].sort(() => 0.5 - Math.random());

    return { systemSelected, options, content, type };
};

export function evaluateMultipleChoiceAnswers(
    trainerId: string,
    wordTestSelects: WordTestSelect[],
    questionAnswers: QuestionAnswer[],
): EvaluateResult {
    const wordResults: VocabTrainerResult[] = [];
    const createResults: Prisma.VocabTrainerResultCreateManyInput[] = [];
    let correctAnswers = 0;

    for (const wordTest of wordTestSelects) {
        let isCorrect = false;

        const questionAnswer = questionAnswers.find(
            (answer) => answer.vocabId === wordTest.vocabId,
        );

        isCorrect = questionAnswer?.systemSelected === wordTest.userSelected;

        if (isCorrect) correctAnswers++;

        // Prepare data for batch insert
        createResults.push({
            vocabTrainerId: trainerId,
            status: isCorrect ? TrainerStatus.PASSED : TrainerStatus.FAILED,
            userSelected: wordTest.userSelected,
            systemSelected: questionAnswer?.systemSelected ?? '',
        });

        // Add to response
        wordResults.push({
            id: '',
            vocabTrainerId: trainerId,
            status: isCorrect ? TrainerStatus.PASSED : TrainerStatus.FAILED,
            userSelected: wordTest.userSelected,
            systemSelected: questionAnswer?.systemSelected ?? '',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    return { wordResults, createResults, correctAnswers };
}

export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
