import type { VocabGenerateTextTargetJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class VocabGenerateTextTargetProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.VOCAB_GENERATE_TEXT_TARGET) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.VOCAB_GENERATE_TEXT_TARGET].defaultJobOptions);
    }

    public async queueVocabGenerateTextTarget(data: VocabGenerateTextTargetJobData): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.generateTextTarget, data);
    }
}
