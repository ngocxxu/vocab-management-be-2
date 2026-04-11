import type { FillInBlankEvaluationJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class FillInBlankEvaluationProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.FILL_IN_BLANK_EVALUATION) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.FILL_IN_BLANK_EVALUATION].defaultJobOptions);
    }

    public async evaluateAnswers(data: FillInBlankEvaluationJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.evaluateAnswers, data, opts);
    }
}
