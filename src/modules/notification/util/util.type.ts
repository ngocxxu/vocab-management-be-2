import { TemplateData } from '../../common/util/type.util';

export interface NotificationJobData {
  reminderType: string;
  data: TemplateData;
  recipientUserIds: string[];
}