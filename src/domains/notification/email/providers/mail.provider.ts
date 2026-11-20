import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export type SendMailInput = {
    from: string;
    to: string;
    subject: string;
    html: string;
    /** Same key and same body: Resend replays the first response for 24 h instead of sending again. */
    idempotencyKey?: string;
};

type ResendFailure = { name: string; message: string; statusCode: number | null };

/** Keeps Resend's error name and status code, so a caller can tell a bad request from a failure worth retrying. */
function toSendError(failure: ResendFailure): Error & { statusCode: number | null } {
    return Object.assign(new Error(failure.message), { name: failure.name, statusCode: failure.statusCode });
}

@Injectable()
export class MailProvider {
    private readonly resend: Resend;
    private readonly logger = new Logger(MailProvider.name);

    public constructor() {
        this.resend = new Resend(process.env.RESEND_API_KEY);
    }

    public async sendMail(input: SendMailInput): Promise<void> {
        const payload = { from: input.from, to: [input.to], subject: input.subject, html: input.html };
        const { error } = input.idempotencyKey ? await this.resend.emails.send(payload, { idempotencyKey: input.idempotencyKey }) : await this.resend.emails.send(payload);

        if (error) {
            this.logger.error('Resend send failed:', error);
            throw toSendError(error);
        }
    }
}
