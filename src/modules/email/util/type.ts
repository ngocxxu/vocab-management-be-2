export interface ReminderData {
  userName: string;
  content: string;
  dueDate?: string;
}

export interface EmailJobData {
  userEmail: string;
  reminderType: string;
  data: ReminderData;
}