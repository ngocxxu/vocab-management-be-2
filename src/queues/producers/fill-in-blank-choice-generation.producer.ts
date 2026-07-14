import type { FillInBlankChoiceGenerationJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class FillInBlankChoiceGenerationProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.FILL_IN_BLANK_CHOICE_GENERATION) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.FILL_IN_BLANK_CHOICE_GENERATION].defaultJobOptions);
    }

    public async generateQuestions(data: FillInBlankChoiceGenerationJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.generateFillInBlankChoice, data, opts);
    }
}
