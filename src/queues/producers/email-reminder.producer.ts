import type { EmailJobData, ReminderScheduleEmailJobData } from '../interfaces/job-payloads';
import { EEmailReminderType, EReminderType } from '@/domains/reminder/utils';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Job, JobOptions, Queue } from 'bull';
import { QUEUE_CONFIG } from '../config/queue.config';
import { BaseProducer } from './base.producer';

@Injectable()
export class EmailReminderProducer extends BaseProducer {
    public constructor(@InjectQueue(EReminderType.EMAIL_REMINDER) queue: Queue) {
        super(queue, QUEUE_CONFIG[EReminderType.EMAIL_REMINDER].defaultJobOptions);
    }

    public async sendReminder(data: EmailJobData, opts?: JobOptions): Promise<{ jobId: string }> {
        return this.addJob(EEmailReminderType.SEND_REMINDER, data, opts);
    }

    public async sendReminderSchedule(data: ReminderScheduleEmailJobData, opts?: JobOptions): Promise<{ jobId: string }> {
        return this.addJob(EEmailReminderType.SEND_REMINDER_SCHEDULE, data, opts);
    }

    public async getReminderScheduleJob(scheduleId: string): Promise<Job | undefined> {
        return (await this.queue.getJob(`reminder-schedule-${scheduleId}`)) as Job | undefined;
    }

    public async enqueueScheduleJobWithReturnJob(data: ReminderScheduleEmailJobData, opts: JobOptions): Promise<Job> {
        return this.queue.add(EEmailReminderType.SEND_REMINDER_SCHEDULE, data, this.mergeOpts(opts));
    }
}
