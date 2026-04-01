export interface EmailJobData {
  userEmail: string;
  reminderType: string;
  templateName: string;
  data: TemplateData;
}

export interface ReminderScheduleEmailJobData {
  scheduleId: string;
}

export interface TemplateData {
  [key: string]: string | number;
}