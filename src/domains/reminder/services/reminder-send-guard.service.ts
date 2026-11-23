import { Injectable } from '@nestjs/common';
import { ReminderSchedule, TrainerMode } from '@prisma/client';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { EEmailTemplate } from '../utils';

export type ReminderSendGuard = { send: true } | { send: false; reason: string };

/**
 * Last check before a reminder email goes out. The row can still be QUEUED while its trainer was deleted, its reminders were turned
 * off, or its user was deactivated. Those rows are cancelled, not sent. FSRS reminders also have their own prepare step.
 */
@Injectable()
export class ReminderSendGuardService {
    public constructor(private readonly reminderScheduleRepository: ReminderScheduleRepository) {}

    public async check(row: ReminderSchedule): Promise<ReminderSendGuard> {
        if (!row.userId) {
            return { send: false, reason: 'missing_user' };
        }

        const isVocabTrainerRow = row.entityType === VOCAB_TRAINER_ENTITY;
        const isClassicExamReminder = isVocabTrainerRow && row.template === (EEmailTemplate.EXAM_REMINDER as string);
        const state = await this.reminderScheduleRepository.findSendGuardState(row.userId, isVocabTrainerRow ? row.entityId : null);
        if (!state.userActive) {
            return { send: false, reason: 'user_inactive' };
        }
        if (!isClassicExamReminder) {
            return { send: true };
        }
        if (!state.trainer) {
            return { send: false, reason: 'trainer_gone' };
        }
        if (state.trainer.mode !== TrainerMode.CLASSIC) {
            return { send: false, reason: 'trainer_not_classic' };
        }
        if (state.trainer.reminderDisabled) {
            return { send: false, reason: 'reminder_disabled' };
        }

        return { send: true };
    }
}
