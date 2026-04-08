import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EReminderType } from '../../reminder/util';
import { AudioEvaluationJobData } from '../processor/audio-evaluation.processor';
import { FillInBlankEvaluationJobData } from '../processor/fill-in-blank-evaluation.processor';
import { MultipleChoiceGenerationJobData } from '../processor/multiple-choice-generation.processor';
import {
    QueueAudioEvaluationParams,
    QueueFillInBlankEvaluationParams,
    QueueMultipleChoiceGenerationParams,
} from '../util/ai-service-types.util';

@Injectable()
export class AiQueueService {
    public constructor(
        @InjectQueue(EReminderType.AUDIO_EVALUATION)
        private readonly audioEvaluationQueue: Queue,
        @InjectQueue(EReminderType.MULTIPLE_CHOICE_GENERATION)
        private readonly multipleChoiceQueue: Queue,
        @InjectQueue(EReminderType.FILL_IN_BLANK_EVALUATION)
        private readonly fillInBlankEvaluationQueue: Queue,
    ) {}

    public async queueAudioEvaluation(
        params: QueueAudioEvaluationParams,
    ): Promise<{ jobId: string }> {
        const job = await this.audioEvaluationQueue.add('evaluate-audio', {
            ...params,
        } as Omit<AudioEvaluationJobData, 'jobId'>);

        return { jobId: job.id || '' };
    }

    public async queueMultipleChoiceGeneration(
        params: QueueMultipleChoiceGenerationParams,
    ): Promise<{ jobId: string }> {
        const job = await this.multipleChoiceQueue.add('generate-questions', {
            ...params,
        } as MultipleChoiceGenerationJobData);

        return { jobId: job.id || '' };
    }

    public async queueFillInBlankEvaluation(
        params: QueueFillInBlankEvaluationParams,
    ): Promise<{ jobId: string }> {
        const job = await this.fillInBlankEvaluationQueue.add('evaluate-answers', {
            ...params,
        } as Omit<FillInBlankEvaluationJobData, 'jobId'>);

        return { jobId: job.id || '' };
    }
}

