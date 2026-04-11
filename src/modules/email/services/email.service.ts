import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailTemplates } from '../templates/email.templates';
import { TemplateData } from '../utils/type';

@Injectable()
export class EmailService {
    private readonly transporter;
    private readonly logger = new Logger(EmailService.name);

    public constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
            // debug: true,
            // logger: true,
        });

        // Verify connection
        void this.verifyConnection();
    }

    public async verifyConnection() {
        try {
            await this.transporter.verify();
            this.logger.log('✅ SMTP connection verified successfully');
        } catch (error) {
            this.logger.error('❌ SMTP connection failed:', error);
        }
    }

    public async sendReminderEmail(
        userEmail: string,
        reminderType: string,
        templateName: string,
        data: TemplateData,
    ) {
        try {
            this.logger.log(`📤 Sending ${templateName} email to: ${userEmail}`);

            const result = await this.transporter.sendMail({
                from: '"Vocab Management" <noreply@vocab-management.com>',
                to: userEmail,
                subject: `[Reminder]: ${reminderType}`,
                html: EmailTemplates.render(templateName, data), // ← Dynamic template
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
