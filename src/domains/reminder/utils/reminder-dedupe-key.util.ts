export const buildReminderDedupeKey = {
    vocabTrainerInitial(trainerId: string, chainIndex: number): string {
        return `vocab-trainer:${trainerId}:initial:chain-${chainIndex}`;
    },

    /** One FSRS reminder per trainer per local day; `localDate` is YYYY-MM-DD. */
    vocabTrainerFsrsDaily(trainerId: string, localDate: string): string {
        return `vocab-trainer:${trainerId}:fsrs:${localDate}`;
    },

    vocabTrainerEscalation(initialDedupeKey: string, level: number): string {
        return `${initialDedupeKey}:esc-${level}`;
    },
};
