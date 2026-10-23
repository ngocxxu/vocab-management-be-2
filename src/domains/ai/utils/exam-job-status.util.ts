import type { VocabTrainerQueueName } from '../constants/vocab-trainer-job.constants';
import { ExamJobStatusDto } from '../../vocab-trainer/dto/exam-job-status.dto';

type BullJobState = 'completed' | 'failed' | 'delayed' | 'active' | 'waiting' | 'paused' | 'stuck';

const GENERATION_QUEUES: ReadonlySet<VocabTrainerQueueName> = new Set(['multiple-choice-generation', 'fill-in-blank-choice-generation']);

export interface ExamJobSnapshot {
    jobId: string;
    queueName: VocabTrainerQueueName;
    state: BullJobState | 'unknown';
    returnvalue?: unknown;
    failedReason?: string;
}

/** Maps a Bull job to the same status vocabulary the `*-progress` socket events use. */
export function toExamJobStatus(snapshot: ExamJobSnapshot | undefined, jobId: string): ExamJobStatusDto {
    if (!snapshot || snapshot.state === 'unknown') {
        return new ExamJobStatusDto({ jobId, status: 'unknown' });
    }

    if (snapshot.state === 'completed') {
        const data = typeof snapshot.returnvalue === 'object' && snapshot.returnvalue !== null ? snapshot.returnvalue : undefined;
        return new ExamJobStatusDto({ jobId, status: 'completed', data });
    }

    if (snapshot.state === 'failed') {
        return new ExamJobStatusDto({ jobId, status: 'failed', error: snapshot.failedReason ?? 'Job failed' });
    }

    // waiting / active / delayed (backoff before a retry) / paused / stuck: still in progress.
    return new ExamJobStatusDto({ jobId, status: GENERATION_QUEUES.has(snapshot.queueName) ? 'generating' : 'evaluating' });
}
