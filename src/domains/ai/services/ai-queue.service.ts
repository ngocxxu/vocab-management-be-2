import type { VocabTrainerQueueName } from '../constants/vocab-trainer-job.constants';
import type { ActiveVocabTrainerJob, VocabTrainerJobType } from '../dto/active-vocab-trainer-job.dto';
import type { AudioEvaluationJobData, FillInBlankChoiceGenerationJobData, FillInBlankEvaluationJobData, MultipleChoiceGenerationJobData } from '@/queues/interfaces/job-payloads';
import { AudioEvaluationProducer } from '@/queues/producers/audio-evaluation.producer';
import { FillInBlankChoiceGenerationProducer } from '@/queues/producers/fill-in-blank-choice-generation.producer';
import { FillInBlankEvaluationProducer } from '@/queues/producers/fill-in-blank-evaluation.producer';
import { MultipleChoiceGenerationProducer } from '@/queues/producers/multiple-choice-generation.producer';
import { captureSentryException } from '@/shared';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bull';
import { randomUUID } from 'crypto';
import { ExamJobStatusDto } from '../../vocab-trainer/dto/exam-job-status.dto';
import { AiConflictException } from '../exceptions';
import {
    AttemptUndo,
    QueueAudioEvaluationParams,
    QueueFillInBlankChoiceGenerationParams,
    QueueFillInBlankEvaluationParams,
    QueueJobResult,
    QueueMultipleChoiceGenerationParams,
    QueueRegradeParams,
    RegradeClaim,
} from '../utils/ai-service-types.util';
import { ExamJobSnapshot, toExamJobStatus } from '../utils/exam-job-status.util';
import { VocabTrainerJobLockService } from './vocab-trainer-job-lock.service';

/** What every queued AI job knows about its owner, trainer and kind. */
type QueueJobParams = { userId: string; vocabTrainerId: string; jobType: VocabTrainerJobType; queueName: VocabTrainerQueueName };

@Injectable()
export class AiQueueService {
    public constructor(
        private readonly audioEvaluationProducer: AudioEvaluationProducer,
        private readonly multipleChoiceProducer: MultipleChoiceGenerationProducer,
        private readonly fillInBlankChoiceProducer: FillInBlankChoiceGenerationProducer,
        private readonly fillInBlankProducer: FillInBlankEvaluationProducer,
        private readonly vocabTrainerJobLockService: VocabTrainerJobLockService,
    ) {}

    public async queueAudioEvaluation(params: QueueAudioEvaluationParams): Promise<QueueJobResult> {
        const { decideAttempt, recordAttempt, ...jobParams } = params;

        return this.withUserActiveJobLock(
            jobParams,
            async (jobData, opts) => this.audioEvaluationProducer.queueAudioEvaluation(jobData as AudioEvaluationJobData, opts),
            async () => {
                const decision = decideAttempt();
                return { decision, undo: await recordAttempt(decision) };
            },
        );
    }

    public async queueMultipleChoiceGeneration(params: QueueMultipleChoiceGenerationParams): Promise<QueueJobResult> {
        return this.withUserActiveJobLock(params, async (jobData, opts) => this.multipleChoiceProducer.generateQuestions(jobData as MultipleChoiceGenerationJobData, opts));
    }

    public async queueFillInBlankChoiceGeneration(params: QueueFillInBlankChoiceGenerationParams): Promise<QueueJobResult> {
        return this.withUserActiveJobLock(params, async (jobData, opts) => this.fillInBlankChoiceProducer.generateQuestions(jobData as FillInBlankChoiceGenerationJobData, opts));
    }

    public async queueFillInBlankEvaluation(params: QueueFillInBlankEvaluationParams): Promise<QueueJobResult> {
        const { decideAttempt, recordAttempt, ...jobParams } = params;

        // Decided and recorded here, under the user's job lock: a submit that joins the running job never gets this far (#42, D-ai; #17).
        return this.withUserActiveJobLock(
            jobParams,
            async (jobData, opts) => this.fillInBlankProducer.evaluateAnswers(jobData as FillInBlankEvaluationJobData, opts),
            async () => {
                const decision = await decideAttempt();
                return { decision, undo: await recordAttempt(decision) };
            },
        );
    }

    /**
     * Regrades a failed submit with the answers it stored. It takes the user's job lock like any job, but never re-attaches
     * to a running job: a regrade is its own action, so a second one is refused with 409.
     */
    public async queueRegrade(params: QueueRegradeParams): Promise<QueueJobResult> {
        const { userId, vocabTrainerId, jobType, queueName, claim } = params;
        const jobId = randomUUID();
        const acquireResult = await this.vocabTrainerJobLockService.acquireOrGetActive(userId, vocabTrainerId, queueName, jobType, jobId);

        if (!acquireResult.acquired) {
            throw new AiConflictException('Another exam is still being processed. Please wait for it to finish and try again.');
        }

        const { job } = acquireResult;
        let claimed: RegradeClaim | undefined;
        try {
            claimed = await claim();
            const jobData = { ...claimed.payload, jobType, queueName, jobId: job.jobId, lockToken: job.lockToken };
            await this.enqueueRegrade(queueName, jobData, { jobId: job.jobId });

            return { jobId: job.jobId };
        } catch (error) {
            await this.undoAttempt(claimed?.rollback);
            await this.vocabTrainerJobLockService.releaseIfOwned(userId, job.lockToken);
            throw error;
        }
    }

    /** The active job of the user when it belongs to this trainer, else null. Used to refuse a multiple-choice submit during an AI job. */
    public async getActiveJobForTrainer(userId: string, vocabTrainerId: string): Promise<ActiveVocabTrainerJob | null> {
        const job = await this.vocabTrainerJobLockService.getActiveJob(userId);
        return job?.trainerId === vocabTrainerId ? job : null;
    }

    /** Lets a client that missed the socket event recover. A job of another user or trainer is reported as `unknown`. */
    public async getJobStatus(userId: string, vocabTrainerId: string, jobId: string): Promise<ExamJobStatusDto> {
        const producers: Array<[VocabTrainerQueueName, { getJob: (id: string) => Promise<Job | undefined> }]> = [
            ['audio-evaluation', this.audioEvaluationProducer],
            ['multiple-choice-generation', this.multipleChoiceProducer],
            ['fill-in-blank-choice-generation', this.fillInBlankChoiceProducer],
            ['fill-in-blank-evaluation', this.fillInBlankProducer],
        ];

        for (const [queueName, producer] of producers) {
            const job = await producer.getJob(jobId);
            if (!job) {
                continue;
            }

            const data = job.data as { userId?: string; vocabTrainerId?: string };
            if (data.userId !== userId || data.vocabTrainerId !== vocabTrainerId) {
                break;
            }

            const snapshot: ExamJobSnapshot = {
                jobId,
                queueName,
                state: await job.getState(),
                returnvalue: job.returnvalue,
                failedReason: job.failedReason,
            };
            return toExamJobStatus(snapshot, jobId);
        }

        return toExamJobStatus(undefined, jobId);
    }

    private async enqueueRegrade(queueName: QueueRegradeParams['queueName'], jobData: object, opts: { jobId: string }): Promise<{ jobId: string }> {
        switch (queueName) {
            case 'audio-evaluation':
                return this.audioEvaluationProducer.queueAudioEvaluation(jobData as AudioEvaluationJobData, opts);
            case 'fill-in-blank-evaluation':
                return this.fillInBlankProducer.evaluateAnswers(jobData as FillInBlankEvaluationJobData, opts);
            default:
                throw new Error(`Regrade is not supported for queue ${String(queueName)}`);
        }
    }

    private async undoAttempt(undo: AttemptUndo | undefined): Promise<void> {
        if (!undo) {
            return;
        }
        try {
            await undo();
        } catch (error: unknown) {
            // The lock is still released by the caller. A failed undo is reported, not thrown over the original error.
            captureSentryException(error);
        }
    }

    /**
     * Takes the user's job lock, records the submit when `begin` is given, then queues the job. A running job of the same
     * trainer and kind is joined (no `begin`, nothing recorded). If the queue step fails, the recorded submit is undone and the lock released.
     */
    private async withUserActiveJobLock<T extends QueueJobParams, D extends object = object>(
        params: T,
        enqueue: (jobData: T & D & { jobId: string; lockToken: string }, opts: { jobId: string }) => Promise<{ jobId: string }>,
        begin?: () => Promise<{ decision: D; undo: AttemptUndo }>,
    ): Promise<QueueJobResult> {
        const jobId = randomUUID();
        const acquireResult = await this.vocabTrainerJobLockService.acquireOrGetActive(params.userId, params.vocabTrainerId, params.queueName, params.jobType, jobId);

        if (!acquireResult.acquired) {
            const { activeJob } = acquireResult;
            // Same trainer + same job type: a refresh or double submit, so re-attach to the running job.
            // Anything else holds the user's lock for unrelated work: nothing gets queued, so tell the caller.
            if (activeJob.trainerId !== params.vocabTrainerId || activeJob.jobType !== params.jobType) {
                throw new AiConflictException('Another exam is still being processed. Please wait for it to finish and try again.');
            }

            return {
                jobId: acquireResult.activeJob.jobId,
                activeJob: this.vocabTrainerJobLockService.toResponse(acquireResult.activeJob),
            };
        }

        let started: { decision: D; undo: AttemptUndo } | undefined;
        try {
            started = begin ? await begin() : undefined;

            return await enqueue(
                {
                    ...params,
                    ...started?.decision,
                    jobId: acquireResult.job.jobId,
                    lockToken: acquireResult.job.lockToken,
                } as T & D & { jobId: string; lockToken: string },
                { jobId: acquireResult.job.jobId },
            );
        } catch (error) {
            await this.undoAttempt(started?.undo);
            await this.vocabTrainerJobLockService.releaseIfOwned(params.userId, acquireResult.job.lockToken);
            throw error;
        }
    }
}
