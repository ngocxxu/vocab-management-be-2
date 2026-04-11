import { TemplateData } from '@/shared/utils/type.util';

export interface NotificationJobData {
  reminderType: string;
  data: TemplateData;
  recipientUserIds: string[];
}