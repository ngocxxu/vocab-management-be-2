import { Processor, Process } from '@nestjs/bull';
import { LoggerService } from '@nestjs/common';
import { Job } from 'bullmq';
import { EEmailReminderType, EReminderType } from '../../reminder/util';
import { EmailService } from '../service';
import { EmailJobData } from '../util/type';

@Processor(EReminderType.EMAIL_REMINDER)
export class EmailProcessor {
  public constructor(private readonly emailService: EmailService, private readonly logger: LoggerService) {}

  @Process(EEmailReminderType.SEND_REMINDER)
  public async handleReminderEmail(job: Job<EmailJobData>) {
    const { userEmail, reminderType, data } = job.data;

    try {
      await this.emailService.sendReminderEmail(userEmail, reminderType, data);
      this.logger.log(`Email sent successfully to ${userEmail} with reminder type: ${reminderType}`);
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      throw error;
    }
  }
}