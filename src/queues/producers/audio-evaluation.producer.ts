import type { AudioEvaluationJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class AudioEvaluationProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.AUDIO_EVALUATION) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.AUDIO_EVALUATION].defaultJobOptions);
    }

    public async queueAudioEvaluation(data: AudioEvaluationJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.evaluateAudio, data, opts);
    }
}
