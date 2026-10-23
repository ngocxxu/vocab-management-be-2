import type { VocabTrainerQueueName } from '../constants/vocab-trainer-job.constants';
import type { AudioEvaluationJobData, FillInBlankChoiceGenerationJobData, FillInBlankEvaluationJobData, MultipleChoiceGenerationJobData } from '@/queues/interfaces/job-payloads';
import { AudioEvaluationProducer } from '@/queues/producers/audio-evaluation.producer';
import { FillInBlankChoiceGenerationProducer } from '@/queues/producers/fill-in-blank-choice-generation.producer';
import { FillInBlankEvaluationProducer } from '@/queues/producers/fill-in-blank-evaluation.producer';
import { MultipleChoiceGenerationProducer } from '@/queues/producers/multiple-choice-generation.producer';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bull';
import { randomUUID } from 'crypto';
import { ExamJobStatusDto } from '../../vocab-trainer/dto/exam-job-status.dto';
import { AiConflictException } from '../exceptions';
import {
    QueueAudioEvaluationParams,
    QueueFillInBlankChoiceGenerationParams,
    QueueFillInBlankEvaluationParams,
    QueueJobResult,
    QueueMultipleChoiceGenerationParams,
} from '../utils/ai-service-types.util';
import { ExamJobSnapshot, toExamJobStatus } from '../utils/exam-job-status.util';
import { VocabTrainerJobLockService } from './vocab-trainer-job-lock.service';

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
        return this.withUserActiveJobLock(params, async (jobData, opts) => this.audioEvaluationProducer.queueAudioEvaluation(jobData as AudioEvaluationJobData, opts));
    }

    public async queueMultipleChoiceGeneration(params: QueueMultipleChoiceGenerationParams): Promise<QueueJobResult> {
        return this.withUserActiveJobLock(params, async (jobData, opts) => this.multipleChoiceProducer.generateQuestions(jobData as MultipleChoiceGenerationJobData, opts));
    }

    public async queueFillInBlankChoiceGeneration(params: QueueFillInBlankChoiceGenerationParams): Promise<QueueJobResult> {
        return this.withUserActiveJobLock(params, async (jobData, opts) => this.fillInBlankChoiceProducer.generateQuestions(jobData as FillInBlankChoiceGenerationJobData, opts));
    }

    public async queueFillInBlankEvaluation(params: QueueFillInBlankEvaluationParams): Promise<QueueJobResult> {
        return this.withUserActiveJobLock(params, async (jobData, opts) => this.fillInBlankProducer.evaluateAnswers(jobData as FillInBlankEvaluationJobData, opts));
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

    private async withUserActiveJobLock<
        T extends QueueAudioEvaluationParams | QueueMultipleChoiceGenerationParams | QueueFillInBlankChoiceGenerationParams | QueueFillInBlankEvaluationParams,
    >(params: T, enqueue: (jobData: T & { jobId: string; lockToken: string }, opts: { jobId: string }) => Promise<{ jobId: string }>): Promise<QueueJobResult> {
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

        try {
            return await enqueue(
                {
                    ...params,
                    jobId: acquireResult.job.jobId,
                    lockToken: acquireResult.job.lockToken,
                },
                { jobId: acquireResult.job.jobId },
            );
        } catch (error) {
            await this.vocabTrainerJobLockService.releaseIfOwned(params.userId, acquireResult.job.lockToken);
            throw error;
        }
    }
}
