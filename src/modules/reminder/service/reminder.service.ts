import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { EmailJobData, ReminderData } from '../../email/util/type';
import { EEmailReminderType, EReminderType } from '../util';

@Injectable()
export class ReminderService {
  public constructor(
    @InjectQueue(EReminderType.EMAIL_REMINDER) private readonly emailQueue: Queue,
  ) {}

  public async sendImmediateReminder(userEmail: string, reminderType: string, data: ReminderData) {
    await this.emailQueue.add(EEmailReminderType.SEND_REMINDER, {
      userEmail,
      reminderType,
      data,
    });
  }

  public async scheduleReminder(userEmail: string, reminderType: string, data: ReminderData, delayInMs: number) {
    await this.emailQueue.add(EEmailReminderType.SEND_REMINDER, {
      userEmail,
      reminderType,
      data,
    }, {
      delay: delayInMs,
    });
  }

  public async scheduleRecurringReminder(userEmail: string, reminderType: string, data: ReminderData, cronPattern: string) {
    await this.emailQueue.add(EEmailReminderType.SEND_REMINDER, {
      userEmail,
      reminderType,
      data,
    }, {
      repeat: { pattern: cronPattern },
    });
  }

  public async cancelReminder(jobId: string) {
    const job = await this.emailQueue.getJob(jobId) as Job<EmailJobData>;
    if (job) {
      await job.remove();
    }
  }
}