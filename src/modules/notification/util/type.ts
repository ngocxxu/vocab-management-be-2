import { TemplateData } from '../../common/util/type';

export interface NotificationJobData {
  reminderType: string;
  data: TemplateData;
  recipientUserIds: string[];
}