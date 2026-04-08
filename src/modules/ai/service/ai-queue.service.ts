import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EReminderType } from '../../reminder/util';
import { VocabWithTextTargets } from '../../vocab-trainer/util';
import { AudioEvaluationJobData } from '../processor/audio-evaluation.processor';
import { FillInBlankEvaluationJobData } from '../processor/fill-in-blank-evaluation.processor';
import { MultipleChoiceGenerationJobData } from '../processor/multiple-choice-generation.processor';

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

    public async queueAudioEvaluation(params: {
        fileId: string;
        targetDialogue: Array<{ speaker: string; text: string }>;
        sourceLanguage: string;
        targetLanguage: string;
        sourceWords: string[];
        targetStyle?: 'formal' | 'informal';
        targetAudience?: string;
        userId: string;
        vocabTrainerId: string;
    }): Promise<{ jobId: string }> {
        const job = await this.audioEvaluationQueue.add('evaluate-audio', {
            ...params,
        } as Omit<AudioEvaluationJobData, 'jobId'>);

        return { jobId: job.id || '' };
    }

    public async queueMultipleChoiceGeneration(params: {
        vocabTrainerId: string;
        vocabList: VocabWithTextTargets[];
        userId: string;
    }): Promise<{ jobId: string }> {
        const job = await this.multipleChoiceQueue.add('generate-questions', {
            ...params,
        } as MultipleChoiceGenerationJobData);

        return { jobId: job.id || '' };
    }

    public async queueFillInBlankEvaluation(params: {
        vocabTrainerId: string;
        evaluations: Array<{
            vocab: VocabWithTextTargets;
            userAnswer: string;
            systemAnswer: string;
            questionType: 'textSource' | 'textTarget';
            vocabId: string;
        }>;
        answerSubmissions: Array<{
            userAnswer: string;
            systemAnswer: string;
        }>;
        userId: string;
    }): Promise<{ jobId: string }> {
        const job = await this.fillInBlankEvaluationQueue.add('evaluate-answers', {
            ...params,
        } as Omit<FillInBlankEvaluationJobData, 'jobId'>);

        return { jobId: job.id || '' };
    }
}

