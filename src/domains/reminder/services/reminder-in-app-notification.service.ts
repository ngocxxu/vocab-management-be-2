import { NotificationGateway } from '@/domains/platform/events/gateway/notification.gateway';
import { captureSentryException, LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { NotificationAction, NotificationType, PriorityLevel, ReminderSchedule, ReminderScheduleKind } from '@prisma/client';
import { NotificationService } from '../../notification/services/notification.service';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { EEmailTemplate, EXPIRES_AT_30_DAYS } from '../utils';

export type ReminderNotificationKind = 'INITIAL' | 'ESCALATION' | 'FSRS_DUE';

/** What a sent reminder email is told to the bell: the in-app twin of the email, created only after the email went out. */
@Injectable()
export class ReminderInAppNotificationService {
    public constructor(
        private readonly notificationService: NotificationService,
        private readonly notificationGateway: NotificationGateway,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly logger: LoggerService,
    ) {}

    /** Never throws: the email is already sent and marked SENT, so a bell failure must not fail or retry the job. */
    public async notifySent(row: ReminderSchedule, emailData: Record<string, unknown>): Promise<void> {
        if (!row.userId || !row.entityId) {
            return;
        }

        try {
            const kind = this.kindOf(row);
            const trainer = await this.reminderScheduleRepository.findTrainerBrief(row.userId, row.entityId);
            const trainerName = trainer?.name ?? this.readString(emailData.trainerName) ?? this.readString(emailData.testName) ?? '';

            const notification = await this.notificationService.create({
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                priority: kind === 'ESCALATION' ? PriorityLevel.MEDIUM : PriorityLevel.LOW,
                expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
                isActive: true,
                recipientUserIds: [row.userId],
                data: {
                    trainerId: row.entityId,
                    trainerName,
                    ...(trainer?.questionType ? { questionType: trainer.questionType } : {}),
                    message: this.messageOf(kind, trainerName),
                    kind,
                    scheduleId: row.id,
                },
            });

            this.emitToUser(row.userId, notification.id, kind);
        } catch (error: unknown) {
            this.logger.error(`In-app reminder notification failed for schedule ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
            captureSentryException(error, {
                tags: { 'reminder.schedule_id': row.id },
            });
        }
    }

    private emitToUser(userId: string, notificationId: string, kind: ReminderNotificationKind): void {
        try {
            this.notificationGateway.sendToUser(userId, 'reminder', {
                id: notificationId,
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                kind,
            });
        } catch (error: unknown) {
            // The row is saved already; the bell shows it on the next refresh.
            this.logger.warn(`Reminder push failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private kindOf(row: ReminderSchedule): ReminderNotificationKind {
        if (row.template === (EEmailTemplate.FSRS_DUE_REMINDER as string)) {
            return 'FSRS_DUE';
        }

        return row.reminderType === ReminderScheduleKind.ESCALATION ? 'ESCALATION' : 'INITIAL';
    }

    private messageOf(kind: ReminderNotificationKind, trainerName: string): string {
        if (kind === 'FSRS_DUE') {
            return `You have cards to review in "${trainerName}"`;
        }

        return `Time to retake your test "${trainerName}"`;
    }

    private readString(value: unknown): string | undefined {
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
}
