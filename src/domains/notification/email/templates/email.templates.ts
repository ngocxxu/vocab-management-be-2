import { EEmailTemplate } from '../../../reminder/utils';
import { TemplateData } from '../utils/type';

export class EmailTemplates {
    private static readonly templateRegistry: Map<string, (data: TemplateData) => string> = new Map([
        [EEmailTemplate.REMINDER, (data: TemplateData) => EmailTemplates.reminderTemplate(data)],
        [EEmailTemplate.EXAM_REMINDER, (data: TemplateData) => EmailTemplates.examReminderTemplate(data)],
        [EEmailTemplate.WELCOME, (data: TemplateData) => EmailTemplates.welcomeTemplate(data)],
    ]);

    public static render(templateName: string, data: TemplateData): string {
        const templateFunction = this.templateRegistry.get(templateName);

        if (!templateFunction) {
            throw new Error(`Template '${templateName}' not found. Available templates: ${Array.from(this.templateRegistry.keys()).join(', ')}`);
        }

        return templateFunction(data);
    }

    public static examReminderTemplate(data: TemplateData): string {
        return EmailTemplates.shell({
            icon: '&#128276;',
            heading: 'Test Reminder',
            body: `
              <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14.5px; line-height:1.6; color:#5f6368;">
                Hello <strong style="color:#202124;">${data.firstName} ${data.lastName}</strong>,
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
                <tr>
                  <td style="background-color:#e8f0fe; border-radius:8px; padding:15px;">
                    <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14.5px; line-height:1.5; color:#202124;">
                      This is a reminder to complete your test: <strong>"${data.testName}"</strong>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0 0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:13px; color:#5f6368;">
                <strong>Repeat schedule:</strong> Every ${data.repeatDays} days
              </p>
              ${EmailTemplates.ctaButton(String(data.examUrl ?? ''), 'Complete test now')}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                <tr>
                  <td style="background-color:#fef7e0; border-radius:8px; padding:14px 15px;">
                    <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:13px; line-height:1.5; color:#b06000;">
                      &#128161; <strong>Tip:</strong> Regular practice helps improve your vocabulary retention.
                    </p>
                  </td>
                </tr>
              </table>
            `,
            footerNote: "If you don't want to receive these reminders, please contact support.",
        });
    }

    public static reminderTemplate(data: TemplateData): string {
        return EmailTemplates.shell({
            icon: '&#9200;',
            heading: `Hello ${data.userName}!`,
            body: `
              <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14.5px; line-height:1.6; color:#5f6368;">${data.content}</p>
              ${
                  data.dueDate
                      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                <tr>
                  <td style="background-color:#fef7e0; border-radius:8px; padding:12px 15px;">
                    <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial,
                      sans-serif; font-size:13.5px; color:#b06000;"><strong>Due date:</strong> ${data.dueDate}</p>
                  </td>
                </tr>
              </table>`
                      : ''
              }
            `,
        });
    }

    public static welcomeTemplate(data: TemplateData): string {
        return EmailTemplates.shell({
            icon: '&#127881;',
            heading: 'Welcome to Vocab Management!',
            body: `
              <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14.5px; line-height:1.6; color:#5f6368;">
                Hi <strong style="color:#202124;">${data.userName}</strong>, thank you for joining our platform. Get ready to boost your vocabulary!
              </p>
              ${EmailTemplates.ctaButton(String(data.loginUrl ?? ''), 'Get started')}
            `,
        });
    }

    public static passwordResetTemplate(data: TemplateData): string {
        return EmailTemplates.shell({
            icon: '&#128274;',
            heading: 'Password reset request',
            body: `
              <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14.5px; line-height:1.6; color:#5f6368;">
                Hi <strong style="color:#202124;">${data.userName}</strong>, you requested to reset your password. Click the button below to choose a new one.
              </p>
              ${EmailTemplates.ctaButton(String(data.resetUrl ?? ''), 'Reset password')}
            `,
            footerNote: "This link will expire in 1 hour. If you didn't request this, please ignore this email.",
        });
    }

    private static ctaButton(url: string, label: string): string {
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
            <tr>
              <td align="center" style="border-radius:8px; background-color:#1a73e8;">
                <a href="${url}" target="_blank" style="display:block; padding:13px 24px;
                  font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14.5px;
                  font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>
        `;
    }

    private static shell(options: { icon: string; heading: string; body: string; footerNote?: string }): string {
        const { icon, heading, body, footerNote } = options;

        return `
        <!DOCTYPE html>
        <html lang="en">
        <body style="margin:0; padding:0; background-color:#f8f9fd; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fd;">
            <tr>
              <td align="center" style="padding:40px 16px;">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%;">

                  <tr>
                    <td align="center" style="padding-bottom:28px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="width:28px; height:28px; background-color:#1a73e8; border-radius:8px; text-align:center; vertical-align:middle;">
                            <span style="font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial,
                              sans-serif; font-size:14px; font-weight:700; color:#ffffff; line-height:28px;">V</span>
                          </td>
                          <td style="padding-left:10px; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica,
                            Arial, sans-serif; font-size:15px; font-weight:600; color:#202124;">Vocab Management</td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="background-color:#ffffff; border:1px solid #e8eaed; border-radius:12px; padding:0; box-shadow:0 1px 2px rgba(60,64,67,0.08);">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                        <tr>
                          <td align="center" style="padding:40px 40px 0 40px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                              <tr>
                                <td width="48" height="48" align="center" valign="middle" style="width:48px;
                                  height:48px; background-color:#e8f0fe; border-radius:10px; text-align:center; vertical-align:middle;">
                                  <div style="width:48px; height:48px; line-height:48px; font-size:20px; color:#1a73e8; text-align:center;">${icon}</div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:20px 40px 0 40px;">
                            <h1 style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial,
                              sans-serif; font-size:22px; line-height:1.35; color:#202124; font-weight:600;">${heading}</h1>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:12px 40px 0 40px;">
                            ${body}
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:24px 40px 32px 40px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr><td style="border-top:1px solid #e8eaed; font-size:0; line-height:0;">&nbsp;</td></tr>
                            </table>
                            <p style="margin:16px 0 0 0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12.5px; line-height:1.6; color:#5f6368;">
                              ${footerNote ?? 'This is an automated message from Vocab Management. Please do not reply to this email.'}
                            </p>
                          </td>
                        </tr>

                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding:24px 16px 0 16px;">
                      <p style="margin:0; font-family:'Lexend', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; line-height:1.6; color:#5f6368;">
                        &copy; Vocab Management &middot; support@mail.ngocquach.com
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        `;
    }
}
