import { Injectable, Logger } from '@nestjs/common';
import { MailProvider } from '../providers';
import { EmailTemplates } from '../templates/email.templates';
import { TemplateData } from '../utils/type';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    public constructor(private readonly mailProvider: MailProvider) {}

    public async verifyConnection(): Promise<void> {
        await this.mailProvider.verifyConnection();
    }

    public async sendReminderEmail(
        userEmail: string,
        reminderType: string,
        templateName: string,
        data: TemplateData,
    ) {
        try {
            this.logger.log(`📤 Sending ${templateName} email to: ${userEmail}`);

            const result = await this.mailProvider.sendMail({
                from: '"Vocab Management" <noreply@vocab-management.com>',
                to: userEmail,
                subject: `[Reminder]: ${reminderType}`,
                html: EmailTemplates.render(templateName, data),
            });

            return result;
        } catch (error) {
            this.logger.error('❌ Failed to send email:', {
                error: (error as Error & { code: string }).message,
                code: (error as Error & { code: string }).code,
                command: (error as Error & { command: string }).command,
                to: userEmail,
            });
            throw error;
        }
    }
}
