import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type SendMailInput = {
    from: string;
    to: string;
    subject: string;
    html: string;
};

@Injectable()
export class MailProvider {
    private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
    private readonly logger = new Logger(MailProvider.name);

    public constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
        void this.verifyConnection();
    }

    public async verifyConnection(): Promise<void> {
        try {
            await this.transporter.verify();
            this.logger.log('SMTP connection verified successfully');
        } catch (error) {
            this.logger.error('SMTP connection failed:', error);
        }
    }

    public async sendMail(input: SendMailInput): Promise<SMTPTransport.SentMessageInfo> {
        return this.transporter.sendMail(input);
    }
}
