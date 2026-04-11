import type { MultipleChoiceGenerationJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class MultipleChoiceGenerationProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.MULTIPLE_CHOICE_GENERATION) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.MULTIPLE_CHOICE_GENERATION].defaultJobOptions);
    }

    public async generateQuestions(data: MultipleChoiceGenerationJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.generateQuestions, data, opts);
    }
}
