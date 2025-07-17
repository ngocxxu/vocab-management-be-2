import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { LoggerService } from '../../common';
import { EmailService } from '../service';
import { EmailJobData } from '../util/type';

@Processor('email_reminder')
export class EmailProcessor {
  public constructor(private readonly emailService: EmailService, private readonly logger: LoggerService) {}

  @Process('send_reminder')
  public async handleReminderEmail(job: Job<EmailJobData>) {
    const { userEmail, reminderType, data } = job.data;

    try {
      await this.emailService.sendReminderEmail(userEmail, reminderType, data);
      this.logger.info(`Email sent successfully to ${userEmail} with reminder type: ${reminderType}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      throw error;
    }
  }
}