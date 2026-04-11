import { Injectable } from '@nestjs/common';
import { Prisma, ReminderChannel, ReminderScheduleKind, ReminderScheduleStatus, User, VocabTrainer } from '@prisma/client';
import { TemplateData } from '../../notification/email/utils/type';
import { ESCALATION_CONFIG, REMINDER_CONFIG } from '../config/reminder.config';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { EEmailTemplate, EReminderTitle } from '../utils';
import { addUtcDays } from '../utils/reminder-date.util';
import { buildReminderDedupeKey } from '../utils/reminder-dedupe-key.util';
import { ReminderService } from './reminder.service';

const ACTIVE_CANCEL_STATUSES: ReminderScheduleStatus[] = [ReminderScheduleStatus.PENDING, ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.QUEUED];

export interface AfterExamReminderInput {
    trainerId: string;
    userId: string;
    userEmail: string;
    firstName: string;
    lastName: string;
    trainerName: string;
    scorePercentage: number;
    examUrl: string;
    reminderDisabled: boolean;
}

@Injectable()
export class VocabTrainerReminderAfterExamService {
    public constructor(private readonly reminderService: ReminderService) {}

    public async cancelSchedulesForTrainerTx(tx: Prisma.TransactionClient, trainerId: string, cancelledBy: string, reason: string): Promise<void> {
        const now = new Date();
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

    public async syncRemindersAfterExamSubmission(tx: Prisma.TransactionClient, input: AfterExamReminderInput): Promise<void> {
        await this.cancelSchedulesForTrainerTx(tx, input.trainerId, input.userId, 'exam_submitted');

        if (input.reminderDisabled) {
            return;
        }

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
        const dueAt = addUtcDays(new Date(), REMINDER_CONFIG.chain.initialDelayDays);
        const dedupeKey = buildReminderDedupeKey.vocabTrainerInitial(input.trainerId, chainIndex);

        const payload: TemplateData = {
            firstName: input.firstName,
            lastName: input.lastName,
            testName: input.trainerName,
            repeatDays: String(REMINDER_CONFIG.chain.initialDelayDays),
            examUrl: input.examUrl,
        };

        try {
            await tx.reminderSchedule.create({
                data: {
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
            });
        } catch (e: unknown) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2002' || e.code === 'P2034')) {
                return;
            }
            throw e;
        }
    }

    public async scheduleNotification(
        user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>,
        trainer: Pick<VocabTrainer, 'id' | 'name' | 'questionType' | 'reminderLastRemind'>,
        scorePercentage: number,
        examUrl: string,
    ): Promise<void> {
        const sendDataNotification: TemplateData = {
            trainerName: trainer.name,
            scorePercentage,
            trainerId: trainer.id,
            questionType: trainer.questionType,
            examUrl,
        };

        const delayInMs = REMINDER_CONFIG.chain.initialDelayDays * 24 * 60 * 60 * 1000;

        await this.reminderService.scheduleCreateNotification([user.id], EReminderTitle.VOCAB_TRAINER, sendDataNotification, delayInMs);
    }
}
