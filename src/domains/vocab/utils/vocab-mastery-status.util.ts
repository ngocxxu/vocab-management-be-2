import { VOCAB_STATUS_THRESHOLDS } from '../constants';

export type VocabMasteryHealthStatus = 'CRITICAL' | 'WARNING' | 'NORMAL';

export function classifyMasteryHealth(correctCount: number, incorrectCount: number): VocabMasteryHealthStatus {
    const total = correctCount + incorrectCount;
    if (total === 0) {
        return 'NORMAL';
    }

    const errorRate = incorrectCount / total;
    if (errorRate >= VOCAB_STATUS_THRESHOLDS.CRITICAL) {
        return 'CRITICAL';
    }
    if (errorRate >= VOCAB_STATUS_THRESHOLDS.WARNING) {
        return 'WARNING';
    }
    return 'NORMAL';
}
