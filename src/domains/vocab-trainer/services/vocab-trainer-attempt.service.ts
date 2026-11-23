import { captureSentryException, LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { NotificationAction, NotificationType, Prisma, PriorityLevel, TrainerStatus, VocabTrainer } from '@prisma/client';
import { NotificationService } from '../../notification/services';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { ReminderInAppNotificationService } from '../../reminder/services/reminder-in-app-notification.service';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services/vocab-trainer-reminder-after-exam.service';
import { EXPIRES_AT_30_DAYS } from '../../reminder/utils';
import { VocabTrainerRepository } from '../repositories/vocab-trainer.repository';
import { countsAsAttempt, hasReachedMaxRepeat, nextFailStreak } from '../utils/pass-rules.util';

export interface AttemptUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
}

/** One exam attempt, applied to a trainer row that the caller has locked. */
export interface AttemptInput {
    trainer: VocabTrainer;
    user: AttemptUser;
    /** PASSED or FAILED, from the score of this attempt. */
    overallStatus: TrainerStatus;
    /** From resolveCountsAsAttempt, read under the same lock (or stored in the AI job under the user's job lock). */
    counts: boolean;
    submittedAt: Date;
    /** Left out when the submit did not send one: the stored value stays. */
    countTime?: number;
    examUrl: string;
}

/** What the bells need after the commit. */
export interface AttemptBellInput {
    trainerId: string;
    userId: string;
    trainerName: string;
    passed: boolean;
    completed: boolean;
    maxRepeat: number;
    passes: number;
}

export interface AttemptOutcome extends AttemptBellInput {
    counts: boolean;
    /** The trainer after the attempt. For a completed trainer, the row is gone; this is the state it had when it completed. */
    trainer: VocabTrainer;
}

/**
 * Counts one exam attempt as a Pass, or not, and moves the reminder cycle. Every exam path (multiple choice now, AI evaluation later)
 * goes through here, so the counting rules live in one place. See docs/features/pass-counting.md.
 */
@Injectable()
export class VocabTrainerAttemptService {
    public constructor(
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly reminderAfterExam: VocabTrainerReminderAfterExamService,
        private readonly reminderInApp: ReminderInAppNotificationService,
        private readonly notificationService: NotificationService,
        private readonly logger: LoggerService,
        private readonly reminderSchedules: ReminderScheduleRepository,
    ) {}

    /**
     * Whether a new attempt counts. Read-only. Call it under the trainer row lock (multiple choice) or under the user's job lock
     * (AI), so the answer cannot change before the attempt is applied.
     */
    public async resolveCountsAsAttempt(trainerId: string, tx?: Prisma.TransactionClient, now: Date = new Date()): Promise<boolean> {
        const trainer = await this.vocabTrainerRepository.findVocabTrainerByIdMinimal(trainerId, tx);
        if (!trainer) {
            return false;
        }

        const hasInFlightInitial = await this.reminderSchedules.hasInFlightInitial(trainerId, tx);

        return countsAsAttempt({
            remindersOff: trainer.reminderDisabled,
            hasInFlightInitial,
            lastCountedAt: trainer.reminderLastCountedAt,
            now,
        });
    }

    /** Applies the attempt inside the caller's transaction. The trainer row must be locked by that transaction. */
    public async applyAttemptTx(tx: Prisma.TransactionClient, input: AttemptInput): Promise<AttemptOutcome> {
        const { trainer, user, overallStatus, counts, submittedAt, countTime, examUrl } = input;
        const passed = overallStatus === TrainerStatus.PASSED;
        const passes = counts && passed ? trainer.reminderRepeat + 1 : trainer.reminderRepeat;
        const completed = counts && passed && hasReachedMaxRepeat(passes, trainer.reminderMaxRepeat);
        const reminderFailStreak = nextFailStreak(trainer.reminderFailStreak, counts, passed);
        const bell = { trainerId: trainer.id, userId: user.id, trainerName: trainer.name, passed, completed, maxRepeat: trainer.reminderMaxRepeat, passes };

        if (completed) {
            await this.reminderAfterExam.cancelSchedulesForTrainerTx(tx, trainer.id, user.id, 'trainer_completed_max_passes');
            await this.vocabTrainerRepository.deleteVocabTrainerRow(trainer.id, tx);

            return { ...bell, counts, trainer: { ...trainer, status: overallStatus, reminderRepeat: passes, reminderFailStreak } };
        }

        const updated = await this.vocabTrainerRepository.updateVocabTrainerWithIncludes(
            trainer.id,
            {
                status: overallStatus,
                countTime,
                reminderRepeat: passes,
                reminderFailStreak,
                lastExamSubmittedAt: submittedAt,
                ...(counts ? { reminderLastCountedAt: submittedAt, reminderLastRemind: submittedAt } : {}),
            },
            tx,
        );

        if (counts) {
            await this.reminderAfterExam.syncRemindersAfterExamSubmission(tx, {
                trainerId: trainer.id,
                userId: user.id,
                userEmail: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                trainerName: trainer.name,
                examUrl,
                spacingDays: trainer.reminderSpacingDays,
                reminderDisabled: trainer.reminderDisabled,
            });
        }

        return { ...bell, counts, trainer: updated };
    }

    /** Runs after the commit. A failure is logged and reported to Sentry, never thrown to the user. */
    public async afterCommit(outcome: AttemptBellInput): Promise<void> {
        if (outcome.passed || outcome.completed) {
            await this.runBestEffort(outcome.trainerId, async () => this.reminderInApp.hideTrainerBells(outcome.trainerId));
        }
        if (outcome.completed) {
            await this.runBestEffort(outcome.trainerId, async () => this.createCompletionBell(outcome));
        }
    }

    private async createCompletionBell(outcome: AttemptBellInput): Promise<void> {
        await this.notificationService.create({
            type: NotificationType.VOCAB_TRAINER,
            action: NotificationAction.CREATE,
            priority: PriorityLevel.LOW,
            data: {
                trainerName: outcome.trainerName,
                message: `Your test has been completed after ${outcome.maxRepeat} passes`,
                completedAt: new Date().toISOString(),
            },
            expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
            isActive: true,
            recipientUserIds: [outcome.userId],
        });
    }

    private async runBestEffort(trainerId: string, step: () => Promise<void>): Promise<void> {
        try {
            await step();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Attempt bell step failed for trainer ${trainerId}: ${message}`);
            captureSentryException(error, { tags: { 'vocab_trainer.id': trainerId } });
        }
    }
}
