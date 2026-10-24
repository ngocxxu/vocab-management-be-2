import { NotificationService } from '@/domains/notification/services';
import { NotificationGateway } from '@/domains/platform/events/gateway';
import { captureSentryException, LoggerService } from '@/shared';
import type { TemplateData } from '@/shared/utils/type.util';
import { Injectable } from '@nestjs/common';
import { NotificationAction, NotificationType, PriorityLevel, ReminderSchedule, ReminderScheduleKind } from '@prisma/client';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { EEmailTemplate, EReminderNotificationKind, EXPIRES_AT_30_DAYS } from '../utils';

const REMINDER_NOTIFICATION = { type: NotificationType.VOCAB_TRAINER, action: NotificationAction.REMIND } as const;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** The Bell notification of a Reminder: the in-app twin of the email, created only after the email went out. */
@Injectable()
export class ReminderInAppNotificationService {
    public constructor(
        private readonly notificationService: NotificationService,
        private readonly notificationGateway: NotificationGateway,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly logger: LoggerService,
    ) {}

    /** Never throws: the email is already sent and marked SENT, so a bell failure must not fail or retry the job. */
    public async notifyReminderSent(row: ReminderSchedule, emailData: TemplateData): Promise<void> {
        if (!row.userId || !row.entityId) {
            return;
        }

        try {
            const kind = this.resolveKind(row);
            const trainer = await this.reminderScheduleRepository.findTrainerBrief(row.userId, row.entityId);
            const trainerName = trainer?.name ?? this.readText(emailData.trainerName) ?? this.readText(emailData.testName) ?? '';

            const notification = await this.notificationService.create({
                ...REMINDER_NOTIFICATION,
                priority: kind === EReminderNotificationKind.ESCALATION ? PriorityLevel.MEDIUM : PriorityLevel.LOW,
                expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                isActive: true,
                recipientUserIds: [row.userId],
                data: {
                    trainerId: row.entityId,
                    trainerName,
                    ...(trainer?.questionType ? { questionType: trainer.questionType } : {}),
                    message: this.buildMessage(kind, trainerName),
                    kind,
                    scheduleId: row.id,
                },
            });

            this.pushToUser(row.userId, row.id, notification.id, kind);
        } catch (error: unknown) {
            this.logger.error(`In-app reminder notification failed for schedule ${row.id}: ${errorMessage(error)}`);
            captureSentryException(error, { tags: { 'reminder.schedule_id': row.id } });
        }
    }

    /** Best effort: the row is saved already, so a missed push only means the bell shows it on its next refresh. */
    private pushToUser(userId: string, scheduleId: string, notificationId: string, kind: EReminderNotificationKind): void {
        try {
            this.notificationGateway.sendToUser(userId, 'reminder', { id: notificationId, ...REMINDER_NOTIFICATION, kind });
        } catch (error: unknown) {
            this.logger.warn(`Reminder push failed for schedule ${scheduleId}: ${errorMessage(error)}`);
            captureSentryException(error, { tags: { 'reminder.schedule_id': scheduleId } });
        }
    }

    private resolveKind(row: ReminderSchedule): EReminderNotificationKind {
        if (row.template === (EEmailTemplate.FSRS_DUE_REMINDER as string)) {
            return EReminderNotificationKind.FSRS_DUE;
        }

        return row.reminderType === ReminderScheduleKind.ESCALATION ? EReminderNotificationKind.ESCALATION : EReminderNotificationKind.INITIAL;
    }

    private buildMessage(kind: EReminderNotificationKind, trainerName: string): string {
        if (kind === EReminderNotificationKind.FSRS_DUE) {
            return `You have cards to review in "${trainerName}"`;
        }

        return `Time to retake your test "${trainerName}"`;
    }

    private readText(value: string | number | undefined): string | undefined {
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
}
