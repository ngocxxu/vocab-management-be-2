export interface EmailJobData {
  userEmail: string;
  reminderType: string;
  data: TemplateData;
}

export interface TemplateData {
  [key: string]: string;
}