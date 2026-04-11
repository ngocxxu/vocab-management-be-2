import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JobsOptions, Queue } from 'bullmq';
import { EEmailReminderType, EReminderType } from '@/domains/reminder/utils';
import { QUEUE_CONFIG } from '../config/queue.config';
import type { EmailJobData, ReminderScheduleEmailJobData } from '../interfaces/job-payloads';
import { BaseProducer } from './base.producer';

@Injectable()
export class EmailReminderProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.EMAIL_REMINDER) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.EMAIL_REMINDER].defaultJobOptions);
    }

    public sendReminder(data: EmailJobData, opts?: JobsOptions): Promise<{ jobId: string }> {
        return this.addJob(EEmailReminderType.SEND_REMINDER, data, opts);
    }

    public sendReminderSchedule(
        data: ReminderScheduleEmailJobData,
        opts?: JobsOptions,
    ): Promise<{ jobId: string }> {
        return this.addJob(EEmailReminderType.SEND_REMINDER_SCHEDULE, data, opts);
    }

    public getJob(jobId: string): Promise<Job | undefined> {
        return this.queue.getJob(jobId);
    }

    public getReminderScheduleJob(scheduleId: string): Promise<Job | undefined> {
        return this.queue.getJob(`reminder-schedule-${scheduleId}`);
    }

    public enqueueScheduleJobWithReturnJob(
        data: ReminderScheduleEmailJobData,
        opts: JobsOptions,
    ): Promise<Job> {
        return this.queue.add(
            EEmailReminderType.SEND_REMINDER_SCHEDULE,
            data,
            this.mergeOpts(opts),
        );
    }
}
