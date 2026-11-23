import { LoggerService } from '@/shared';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { Injectable } from '@nestjs/common';
import { TrainerMode, VocabTrainer } from '@prisma/client';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { FsrsReminderService } from '../../reminder/services/fsrs-reminder.service';
import { ReminderInAppNotificationService } from '../../reminder/services/reminder-in-app-notification.service';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services/vocab-trainer-reminder-after-exam.service';
import { VOCAB_TRAINER_ENTITY } from '../../reminder/strategies/vocab-trainer-acted-check.strategy';
import { VocabTrainerBadRequestException, VocabTrainerNotFoundException } from '../exceptions';
import { VocabTrainerRepository } from '../repositories/vocab-trainer.repository';
import { isReminderPromptPending } from '../utils/pass-rules.util';

/**
 * Reminder settings of one trainer: the on/off toggle, the Yes/No prompt after repeated failures, and the clean-up when a
 * trainer is removed. The on/off toggle is the one path for both the trainer update (reminderDisabled) and the prompt.
 */
@Injectable()
export class VocabTrainerReminderService {
    public constructor(
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly reminderAfterExam: VocabTrainerReminderAfterExamService,
        private readonly reminderSchedules: ReminderScheduleRepository,
        private readonly reminderInApp: ReminderInAppNotificationService,
        private readonly fsrsReminderService: FsrsReminderService,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Turns reminders on or off. Off cancels the pending reminders. On plans the next one only when the trainer has a
     * completed attempt and nothing is pending. Both reset the fail streak.
     */
    public async setRemindersEnabled(trainerId: string, userId: string, enabled: boolean): Promise<VocabTrainer> {
        const contact = enabled ? await this.reminderSchedules.findUserContact(userId) : null;

        const updated = await this.vocabTrainerRepository.inTransaction(async (tx) => {
            const trainer = await this.vocabTrainerRepository.lockAndFindForUpdate(tx, trainerId);
            // Scoped to the owner, like every other trainer query: another user's trainer is not found.
            if (!trainer || trainer.userId !== userId) {
                throw new VocabTrainerNotFoundException(trainerId);
            }
            if (trainer.reminderDisabled === !enabled) {
                return trainer;
            }

            const next = await this.vocabTrainerRepository.updateVocabTrainerFields(trainerId, { reminderDisabled: !enabled, reminderFailStreak: 0 }, tx);
            if (!enabled) {
                await this.reminderAfterExam.cancelSchedulesForTrainerTx(tx, trainerId, userId, 'reminders_turned_off');
                return next;
            }

            const canScheduleClassic = trainer.mode === TrainerMode.CLASSIC && trainer.lastExamSubmittedAt !== null && contact !== null;
            if (canScheduleClassic && !(await this.reminderSchedules.hasInFlightInitial(trainerId, tx))) {
                await this.reminderAfterExam.scheduleInitialTx(tx, {
                    trainerId,
                    userId,
                    userEmail: contact.email,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    trainerName: trainer.name,
                    examUrl: `${process.env.FRONTEND_URL}/${trainerId}/exam/${trainer.questionType}`,
                    spacingDays: trainer.reminderSpacingDays,
                    reminderDisabled: false,
                });
            }

            return next;
        });

        if (updated.mode === TrainerMode.FSRS && enabled) {
            await this.fsrsReminderService.sync(userId, trainerId);
        }
        if (!enabled) {
            await this.reminderInApp.hideTrainerBells(trainerId);
        }

        return updated;
    }

    /**
     * Answers the Yes/No prompt. With no prompt pending the trainer comes back unchanged. Yes resets the streak; No turns reminders off.
     */
    public async answerReminderPrompt(trainerId: string, userId: string, continueReminders: boolean): Promise<VocabTrainer> {
        const trainer = await this.vocabTrainerRepository.findById(trainerId, userId);
        if (!trainer) {
            throw new VocabTrainerNotFoundException(trainerId);
        }
        if (trainer.mode === TrainerMode.FSRS) {
            throw new VocabTrainerBadRequestException('The reminder prompt is for Classic trainers only');
        }
        if (!isReminderPromptPending(trainer)) {
            return trainer;
        }
        if (!continueReminders) {
            return this.setRemindersEnabled(trainerId, userId, false);
        }

        return this.vocabTrainerRepository.updateVocabTrainerFields(trainerId, { reminderFailStreak: 0 });
    }

    /** After a trainer is deleted: its open reminders go, and its bells are hidden. Never throws; the delete already happened. */
    public async onTrainerRemoved(trainerId: string, userId: string): Promise<void> {
        try {
            await this.reminderSchedules.cancelByEntity(VOCAB_TRAINER_ENTITY, trainerId, 'trainer_deleted', userId);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Cancelling reminders of deleted trainer ${trainerId} failed: ${message}`);
            captureSentryException(error, { tags: { 'vocab_trainer.id': trainerId } });
        }
        await this.reminderInApp.hideTrainerBells(trainerId);
    }
}
