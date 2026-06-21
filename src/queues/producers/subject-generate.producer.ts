import type { SubjectGenerateJobData } from '../interfaces/job-payloads';
import { EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_CONFIG } from '../config/queue.config';
import { JOB_NAMES } from '../constants/queue.constants';
import { BaseProducer } from './base.producer';

@Injectable()
export class SubjectGenerateProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.SUBJECT_GENERATE) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.SUBJECT_GENERATE].defaultJobOptions);
    }

    public async queueSubjectGenerate(data: SubjectGenerateJobData): Promise<{ jobId: string }> {
        return this.addJob(JOB_NAMES.generateSubjects, data);
    }
}
