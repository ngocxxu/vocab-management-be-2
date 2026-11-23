import { Injectable } from '@nestjs/common';
import { Prisma, ReminderChannel, ReminderScheduleKind, ReminderScheduleStatus } from '@prisma/client';
import { TemplateData } from '../../notification/email/utils/type';
import { ESCALATION_CONFIG, REMINDER_CONFIG } from '../config/reminder.config';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { EEmailTemplate } from '../utils';
import { addUtcDays } from '../utils/reminder-date.util';
import { buildReminderDedupeKey } from '../utils/reminder-dedupe-key.util';

const ACTIVE_CANCEL_STATUSES: ReminderScheduleStatus[] = [ReminderScheduleStatus.PENDING, ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.QUEUED];

export interface AfterExamReminderInput {
    trainerId: string;
    userId: string;
    userEmail: string;
    firstName: string;
    lastName: string;
    trainerName: string;
    examUrl: string;
    /** X: days until the next reminder. The trainer's own setting. */
    spacingDays: number;
    reminderDisabled: boolean;
    /** The counted attempt's submit time. Reminders it cancels are stamped with it, so they never open the next Pass. */
    submittedAt?: Date;
}

@Injectable()
export class VocabTrainerReminderAfterExamService {
    public async cancelSchedulesForTrainerTx(tx: Prisma.TransactionClient, trainerId: string, cancelledBy: string, reason: string, at: Date = new Date()): Promise<void> {
        const now = at;
        await tx.reminderSchedule.updateMany({
            where: {
                entityType: VOCAB_TRAINER_ENTITY,
                entityId: trainerId,
                status: { in: ACTIVE_CANCEL_STATUSES },
            },
            data: {
                status: ReminderScheduleStatus.CANCELLED,
                cancelledAt: now,
                cancelledBy,
                cancelReason: reason,
                completedAt: now,
                lockedBy: null,
                lockedAt: null,
            },
        });
    }

    /** A counted attempt restarts the cycle: the open reminders go and the next one is planned, unless reminders are off. */
    public async syncRemindersAfterExamSubmission(tx: Prisma.TransactionClient, input: AfterExamReminderInput): Promise<void> {
        await this.cancelSchedulesForTrainerTx(tx, input.trainerId, input.userId, 'exam_submitted', input.submittedAt);

        if (input.reminderDisabled) {
            return;
        }

        await this.scheduleInitialTx(tx, input);
    }

    /** Plans the next INITIAL reminder without cancelling anything. Used when reminders are turned on again. */
    public async scheduleInitialTx(tx: Prisma.TransactionClient, input: AfterExamReminderInput): Promise<void> {
        const terminalInitialCount = await tx.reminderSchedule.count({
            where: {
                entityType: VOCAB_TRAINER_ENTITY,
                entityId: input.trainerId,
                reminderType: ReminderScheduleKind.INITIAL,
                status: {
                    in: [ReminderScheduleStatus.SENT, ReminderScheduleStatus.FAILED_TERMINAL, ReminderScheduleStatus.EXPIRED],
                },
            },
        });

        if (terminalInitialCount >= REMINDER_CONFIG.chain.maxCycles) {
            return;
        }

        const chainIndex = terminalInitialCount + 1;
        const dueAt = addUtcDays(new Date(), input.spacingDays);
        const dedupeKey = buildReminderDedupeKey.vocabTrainerInitial(input.trainerId, chainIndex);

        const payload: TemplateData = {
            firstName: input.firstName,
            lastName: input.lastName,
            testName: input.trainerName,
            repeatDays: String(input.spacingDays),
            examUrl: input.examUrl,
        };

        // skipDuplicates is INSERT ... ON CONFLICT DO NOTHING. An open row with the same key is skipped, and the transaction stays usable.
        // A P2002 from a single insert would abort the caller's transaction, and the commit would then roll back the whole attempt silently.
        await tx.reminderSchedule.createMany({
            data: [
                {
                    dedupeKey,
                    channel: ReminderChannel.EMAIL,
                    recipient: input.userEmail,
                    template: EEmailTemplate.EXAM_REMINDER,
                    payload,
                    dueAt,
                    userId: input.userId,
                    entityType: VOCAB_TRAINER_ENTITY,
                    entityId: input.trainerId,
                    reminderType: ReminderScheduleKind.INITIAL,
                    chainCount: chainIndex,
                    chainMax: REMINDER_CONFIG.chain.maxCycles,
                    escalationMax: ESCALATION_CONFIG.maxEscalations,
                    status: ReminderScheduleStatus.PENDING,
                },
            ],
            skipDuplicates: true,
        });
    }
}
