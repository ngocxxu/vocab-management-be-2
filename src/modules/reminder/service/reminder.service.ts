import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { EmailJobData, TemplateData } from '../../email/util/type';
import { EEmailReminderType, EReminderType } from '../util';

@Injectable()
export class ReminderService {
  public constructor(
    @InjectQueue(EReminderType.EMAIL_REMINDER) private readonly emailQueue: Queue,
    @InjectQueue(EReminderType.NOTIFICATION) private readonly notificationQueue: Queue,
  ) {}

  public async sendImmediateReminder(userEmail: string, reminderType: string, templateName: string, data: TemplateData) {
    await this.emailQueue.add(EEmailReminderType.SEND_REMINDER, {
      userEmail,
      reminderType,
      templateName,
      data,
    });
  }

  public async scheduleReminder(userEmail: string, reminderType: string, templateName: string, data: TemplateData, delayInMs: number) {
    await this.emailQueue.add(EEmailReminderType.SEND_REMINDER, {
      userEmail,
      reminderType,
      templateName,
      data,
    }, {
      delay: delayInMs,
    });
  }

  public async scheduleRecurringReminder(userEmail: string, reminderType: string, templateName: string, data: TemplateData, cronPattern: string) {
    await this.emailQueue.add(EEmailReminderType.SEND_REMINDER, {
      userEmail,
      reminderType,
      templateName,
      data,
    }, {
      repeat: { pattern: cronPattern },
    });
  }

  public async sendImmediateCreateNotification(recipientUserIds: string[], reminderType: string, data: TemplateData) {
    await this.notificationQueue.add(EEmailReminderType.SEND_CREATE_NOTIFICATION, {
      recipientUserIds,
      reminderType,
      data,
    });
  }

  public async scheduleCreateNotification(recipientUserIds: string[], reminderType: string, data: TemplateData, delayInMs: number) {
    await this.notificationQueue.add(EEmailReminderType.SEND_CREATE_NOTIFICATION, {
      recipientUserIds,
      reminderType,
      data,
    }, {
      delay: delayInMs,
    });
  }

  public async cancelReminder(jobId: string) {
    const job = await this.emailQueue.getJob(jobId) as Job<EmailJobData>;
    if (job) {
      await job.remove();
    }
  }
}