import { Injectable, Logger } from '@nestjs/common';
import { MailProvider } from '../providers';
import { EmailTemplates } from '../templates/email.templates';
import { TemplateData } from '../utils/type';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    public constructor(private readonly mailProvider: MailProvider) {}

    public async sendReminderEmail(userEmail: string, reminderType: string, templateName: string, data: TemplateData) {
        try {
            this.logger.log(`📤 Sending ${templateName} email to: ${userEmail}`);

            await this.mailProvider.sendMail({
                from: '"Vocab Management" <support@mail.ngocquach.com>',
                to: userEmail,
                subject: `[Reminder]: ${reminderType}`,
                html: EmailTemplates.render(templateName, data),
            });
        } catch (error) {
            this.logger.error('❌ Failed to send email:', {
                error: (error as Error).message,
                to: userEmail,
            });
            throw error;
        }
    }
}
