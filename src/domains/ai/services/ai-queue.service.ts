import { Injectable } from '@nestjs/common';
import type {
    AudioEvaluationJobData,
    FillInBlankEvaluationJobData,
    MultipleChoiceGenerationJobData,
} from '@/queues/interfaces/job-payloads';
import { AudioEvaluationProducer } from '@/queues/producers/audio-evaluation.producer';
import { FillInBlankEvaluationProducer } from '@/queues/producers/fill-in-blank-evaluation.producer';
import { MultipleChoiceGenerationProducer } from '@/queues/producers/multiple-choice-generation.producer';
import {
    QueueAudioEvaluationParams,
    QueueFillInBlankEvaluationParams,
    QueueMultipleChoiceGenerationParams,
} from '../utils/ai-service-types.util';

@Injectable()
export class AiQueueService {
    public constructor(
        private readonly audioEvaluationProducer: AudioEvaluationProducer,
        private readonly multipleChoiceProducer: MultipleChoiceGenerationProducer,
        private readonly fillInBlankProducer: FillInBlankEvaluationProducer,
    ) {}

    public async queueAudioEvaluation(
        params: QueueAudioEvaluationParams,
    ): Promise<{ jobId: string }> {
        return this.audioEvaluationProducer.queueAudioEvaluation({
            ...params,
        } as AudioEvaluationJobData);
    }

    public async queueMultipleChoiceGeneration(
        params: QueueMultipleChoiceGenerationParams,
    ): Promise<{ jobId: string }> {
        return this.multipleChoiceProducer.generateQuestions(
            params as MultipleChoiceGenerationJobData,
        );
    }

    public async queueFillInBlankEvaluation(
        params: QueueFillInBlankEvaluationParams,
    ): Promise<{ jobId: string }> {
        return this.fillInBlankProducer.evaluateAnswers({
            ...params,
        } as FillInBlankEvaluationJobData);
    }
}
