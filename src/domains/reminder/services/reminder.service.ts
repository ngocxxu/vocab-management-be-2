import type { EmailJobData } from '@/queues/interfaces/job-payloads';
import { EmailReminderProducer } from '@/queues/producers/email-reminder.producer';
import { NotificationProducer } from '@/queues/producers/notification.producer';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { TemplateData } from '../../notification/email/utils/type';

@Injectable()
export class ReminderService {
    public constructor(
        private readonly emailReminderProducer: EmailReminderProducer,
        private readonly notificationProducer: NotificationProducer,
    ) {}

    public async sendImmediateReminder(userEmail: string, reminderType: string, templateName: string, data: TemplateData) {
        await this.emailReminderProducer.sendReminder({
            userEmail,
            reminderType,
            templateName,
            data,
        });
    }

    public async scheduleReminder(userEmail: string, reminderType: string, templateName: string, data: TemplateData, delayInMs: number) {
        await this.emailReminderProducer.sendReminder(
            {
                userEmail,
                reminderType,
                templateName,
                data,
            },
            {
                delay: delayInMs,
            },
        );
    }

    public async scheduleRecurringReminder(userEmail: string, reminderType: string, templateName: string, data: TemplateData, cronPattern: string) {
        await this.emailReminderProducer.sendReminder(
            {
                userEmail,
                reminderType,
                templateName,
                data,
            },
            {
                repeat: { pattern: cronPattern },
            },
        );
    }

    public async sendImmediateCreateNotification(recipientUserIds: string[], reminderType: string, data: TemplateData) {
        await this.notificationProducer.sendCreateNotification({
            recipientUserIds,
            reminderType,
            data,
        });
    }

    public async scheduleCreateNotification(recipientUserIds: string[], reminderType: string, data: TemplateData, delayInMs: number) {
        await this.notificationProducer.sendCreateNotification(
            {
                recipientUserIds,
                reminderType,
                data,
            },
            {
                delay: delayInMs,
            },
        );
    }

    public async cancelReminder(jobId: string) {
        const job = (await this.emailReminderProducer.getJob(jobId)) as Job<EmailJobData> | undefined;
        if (job) {
            await job.remove();
        }
    }
}
