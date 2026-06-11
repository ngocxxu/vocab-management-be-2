import type { VocabTrainerQueueName } from '../constants/vocab-trainer-job.constants';

export type VocabTrainerJobType = 'multiple-choice' | 'fill-in-blank' | 'audio';

export interface ActiveVocabTrainerJob {
    jobId: string;
    lockToken: string;
    queueName: VocabTrainerQueueName;
    trainerId: string;
    jobType: VocabTrainerJobType;
    userId: string;
    createdAt: string;
    attempt: number;
}

export interface ActiveJobResponse {
    jobId: string;
    queueName: VocabTrainerQueueName;
    trainerId: string;
    jobType: VocabTrainerJobType;
    createdAt: string;
}

export type AcquireResult = { acquired: true; job: ActiveVocabTrainerJob } | { acquired: false; activeJob: ActiveVocabTrainerJob };
