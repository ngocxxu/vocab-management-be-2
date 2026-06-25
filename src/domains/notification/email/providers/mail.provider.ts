import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export type SendMailInput = {
    from: string;
    to: string;
    subject: string;
    html: string;
};

@Injectable()
export class MailProvider {
    private readonly resend: Resend;
    private readonly logger = new Logger(MailProvider.name);

    public constructor() {
        this.resend = new Resend(process.env.RESEND_API_KEY);
    }

    public async sendMail(input: SendMailInput): Promise<void> {
        const { error } = await this.resend.emails.send({
            from: input.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
        });

        if (error) {
            this.logger.error('Resend send failed:', error);
            throw new Error(error.message);
        }
    }
}
