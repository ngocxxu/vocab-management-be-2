export type FolderStatus = 'Unstarted' | 'Beginner' | 'Learning' | 'Mastered';

const BEGINNER_THRESHOLD = 4;
const LEARNING_THRESHOLD = 8;

export function computeFolderStatus(vocabCount: number, averageMastery: number | null): FolderStatus {
    if (vocabCount === 0) return 'Unstarted';

    const score = averageMastery ?? 0;
    if (score === 0) return 'Unstarted';
    if (score < BEGINNER_THRESHOLD) return 'Beginner';
    if (score < LEARNING_THRESHOLD) return 'Learning';
    return 'Mastered';
}
