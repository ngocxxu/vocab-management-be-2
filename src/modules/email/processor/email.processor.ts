import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { LoggerService } from '../../common';
import { EEmailReminderType, EReminderType } from '../../reminder/util';
import { EmailService } from '../service';
import { EmailJobData } from '../util/type';

@Processor(EReminderType.EMAIL_REMINDER)
export class EmailProcessor {
  public constructor(private readonly emailService: EmailService, private readonly logger: LoggerService) {}

  @Process(EEmailReminderType.SEND_REMINDER)
  public async handleReminderEmail(job: Job<EmailJobData>) {
    const { userEmail, reminderType, templateName, data } = job.data;

    try {
      await this.emailService.sendReminderEmail(userEmail, reminderType, templateName, data);
      this.logger.info(`Email sent successfully to ${userEmail} with reminder type: ${reminderType}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      throw error;
    }
  }
}