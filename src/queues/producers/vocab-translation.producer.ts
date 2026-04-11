import type { VocabTranslationJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class VocabTranslationProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.VOCAB_TRANSLATION) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.VOCAB_TRANSLATION].defaultJobOptions);
    }

    public async translateVocab(data: VocabTranslationJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.translateVocab, data, opts);
    }
}
