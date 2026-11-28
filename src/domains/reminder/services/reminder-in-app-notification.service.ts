import { NotificationService } from '@/domains/notification/services';
import { NotificationGateway } from '@/domains/platform/events/gateway';
import { captureSentryException, LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { NotificationAction, NotificationType, PriorityLevel, ReminderSchedule, ReminderScheduleKind } from '@prisma/client';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { EEmailTemplate, EReminderNotificationKind, EXPIRES_AT_90_DAYS } from '../utils';

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

    /**
     * Never throws: the email is already sent and marked SENT, so a bell failure must not fail or retry the job.
     * No bell for a trainer that is gone. A trainer deleted during the insert gets its bells hidden, and no push.
     */
    public async notifyReminderSent(row: ReminderSchedule): Promise<void> {
        if (!row.userId || !row.entityId) {
            return;
        }

        try {
            const trainer = await this.reminderScheduleRepository.findTrainerBrief(row.userId, row.entityId);
            if (!trainer) {
                this.logger.info(`No reminder bell for schedule ${row.id}: trainer ${row.entityId} is gone`);
                return;
            }

            const kind = this.resolveKind(row);
            const notification = await this.notificationService.create({
                ...REMINDER_NOTIFICATION,
                priority: kind === EReminderNotificationKind.ESCALATION ? PriorityLevel.MEDIUM : PriorityLevel.LOW,
                expiresAt: new Date(Date.now() + EXPIRES_AT_90_DAYS),
                isActive: true,
                recipientUserIds: [row.userId],
                data: {
                    trainerId: row.entityId,
                    trainerName: trainer.name,
                    questionType: trainer.questionType,
                    message: this.buildMessage(kind, trainer.name),
                    kind,
                    scheduleId: row.id,
                },
            });

            // The trainer can be deleted while the bell is written. Then the new bell is hidden, and nothing is pushed.
            const stillThere = await this.reminderScheduleRepository.findTrainerBrief(row.userId, row.entityId);
            if (!stillThere) {
                this.logger.info(`Reminder bell of schedule ${row.id} hidden: trainer ${row.entityId} was deleted during the insert`);
                await this.hideAllTrainerBells(row.entityId);
                return;
            }

            this.pushToUser(row.userId, row.id, notification.id, kind);
        } catch (error: unknown) {
            this.logger.error(`In-app reminder notification failed for schedule ${row.id}: ${errorMessage(error)}`);
            captureSentryException(error, { tags: { 'reminder.schedule_id': row.id } });
        }
    }

    /** Hides the reminder Bells of the trainer. Called when the user passes or turns reminders off. Never throws. */
    public async hideTrainerBells(trainerId: string): Promise<void> {
        try {
            await this.notificationService.hideReminderBells(trainerId);
        } catch (error: unknown) {
            this.logger.error(`Hiding reminder bells failed for trainer ${trainerId}: ${errorMessage(error)}`);
            captureSentryException(error, { tags: { 'reminder.trainer_id': trainerId } });
        }
    }

    /** Hides every Bell of the trainer, grading Bells too. Called when the trainer is deleted or completed. Never throws. */
    public async hideAllTrainerBells(trainerId: string): Promise<void> {
        try {
            await this.notificationService.hideAllTrainerBells(trainerId);
        } catch (error: unknown) {
            this.logger.error(`Hiding all bells failed for trainer ${trainerId}: ${errorMessage(error)}`);
            captureSentryException(error, { tags: { 'reminder.trainer_id': trainerId } });
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
}
