import { TemplateData } from '../util/type';

export class EmailTemplates {
    public static testReminderTemplate(data: TemplateData): string {
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333;">Test Reminder</h2>
              <p style="font-size: 16px;">Hello <strong>${data.firstName} ${data.lastName}</strong>,</p>
              
              <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px;">
                  This is a reminder to complete your test: <strong>"${data.testName}"</strong>
                </p>
              </div>
              
              <p style="font-size: 14px; color: #666;">
                <strong>Repeat Schedule:</strong> Every ${data.repeatDays} days
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.examUrl}" 
                   style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
                  Complete Test Now
                </a>
              </div>
              
              <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #856404;">
                  💡 <strong>Tip:</strong> Regular practice helps improve your vocabulary retention!
                </p>
              </div>
              
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
              <p style="font-size: 12px; color: #666; text-align: center;">
                This is an automated reminder from Vocab Management System.<br>
                If you don't want to receive these reminders, please contact support.
              </p>
            </div>
          </div>
        `;
      }

    public static reminderTemplate(data: TemplateData): string {
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333;">Hello ${data.userName}!</h2>
            <p style="font-size: 16px; line-height: 1.5;">${data.content}</p>
            ${
                data.dueDate
                    ? `<p style="background: #fff3cd; padding: 10px; border-radius: 4px;"><strong>Due Date:</strong> ${data.dueDate}</p>`
                    : ''
            }
            <hr style="margin: 20px 0;">
            <p style="font-size: 12px; color: #666;">
              This is an automated reminder from Vocab Management System.
            </p>
          </div>
        </div>
      `;
    }

    public static welcomeTemplate(data: TemplateData): string {
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #007bff;">Welcome to Vocab Management!</h1>
          <p>Hi ${data.userName},</p>
          <p>Thank you for joining our platform. Get ready to boost your vocabulary!</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.loginUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Get Started
            </a>
          </div>
        </div>
      `;
    }

    public static passwordResetTemplate(data: TemplateData): string {
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hi ${data.userName},</p>
          <p>You requested to reset your password. Click the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 12px; color: #666;">
            This link will expire in 1 hour. If you didn't request this, please ignore this email.
          </p>
        </div>
      `;
    }
}
