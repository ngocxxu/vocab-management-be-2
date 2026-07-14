import type { AudioEvaluationJobData, FillInBlankChoiceGenerationJobData, FillInBlankEvaluationJobData, MultipleChoiceGenerationJobData } from '@/queues/interfaces/job-payloads';
import { AudioEvaluationProducer } from '@/queues/producers/audio-evaluation.producer';
import { FillInBlankChoiceGenerationProducer } from '@/queues/producers/fill-in-blank-choice-generation.producer';
import { FillInBlankEvaluationProducer } from '@/queues/producers/fill-in-blank-evaluation.producer';
import { MultipleChoiceGenerationProducer } from '@/queues/producers/multiple-choice-generation.producer';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
    QueueAudioEvaluationParams,
    QueueFillInBlankChoiceGenerationParams,
    QueueFillInBlankEvaluationParams,
    QueueJobResult,
    QueueMultipleChoiceGenerationParams,
} from '../utils/ai-service-types.util';
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

    private async withUserActiveJobLock<
        T extends QueueAudioEvaluationParams | QueueMultipleChoiceGenerationParams | QueueFillInBlankChoiceGenerationParams | QueueFillInBlankEvaluationParams,
    >(params: T, enqueue: (jobData: T & { jobId: string; lockToken: string }, opts: { jobId: string }) => Promise<{ jobId: string }>): Promise<QueueJobResult> {
        const jobId = randomUUID();
        const acquireResult = await this.vocabTrainerJobLockService.acquireOrGetActive(params.userId, params.vocabTrainerId, params.queueName, params.jobType, jobId);

        if (!acquireResult.acquired) {
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
