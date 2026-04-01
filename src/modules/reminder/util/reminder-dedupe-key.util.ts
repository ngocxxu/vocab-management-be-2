export const buildReminderDedupeKey = {
    vocabTrainerInitial(trainerId: string, chainIndex: number): string {
        return `vocab-trainer:${trainerId}:initial:chain-${chainIndex}`;
    },

    vocabTrainerEscalation(initialDedupeKey: string, level: number): string {
        return `${initialDedupeKey}:esc-${level}`;
    },
};
