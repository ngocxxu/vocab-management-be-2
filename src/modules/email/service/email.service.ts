import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ReminderData } from '../util/type';

@Injectable()
export class EmailService {
  private readonly transporter;

  public constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  public async sendReminderEmail(userEmail: string, reminderType: string, data: ReminderData) {
    await this.transporter.sendMail({
      from: '"Vocab Management" <noreply@vocab-management.com>',
      to: userEmail,
      subject: `Reminder: ${reminderType}`,
      html: `
        <h2>Hello ${data.userName}!</h2>
        <p>${data.content}</p>
        ${data.dueDate ? `<p>Due Date: ${data.dueDate}</p>` : ''}
      `,
    });
  }
}