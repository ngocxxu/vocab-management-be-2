export interface EmailJobData {
  userEmail: string;
  reminderType: string;
  templateName: string;
  data: TemplateData;
}

export interface TemplateData {
  [key: string]: string | number;
}