import { ReminderChannel, ReminderSchedule, ReminderScheduleKind, ReminderScheduleStatus, TrainerMode } from '@prisma/client';
import { ReminderSendGuardService } from './reminder-send-guard.service';

function row(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
    return {
        id: 's1',
        status: ReminderScheduleStatus.QUEUED,
        channel: ReminderChannel.EMAIL,
        template: 'exam_reminder',
        reminderType: ReminderScheduleKind.INITIAL,
        entityType: 'vocab_trainer',
        entityId: 't1',
        userId: 'u1',
        ...overrides,
    } as unknown as ReminderSchedule;
}

function createGuard(state: { userActive: boolean; trainer: { mode: TrainerMode; reminderDisabled: boolean } | null }) {
    const reminderScheduleRepository = { findSendGuardState: jest.fn().mockResolvedValue(state) };
    const guard = new ReminderSendGuardService(reminderScheduleRepository as never);

    return { guard, reminderScheduleRepository };
}

describe('ReminderSendGuardService.check', () => {
    test('a classic reminder whose trainer was deleted is not sent', async () => {
        // Arrange
        const { guard } = createGuard({ userActive: true, trainer: null });

        // Act
        const decision = await guard.check(row());

        // Assert
        expect(decision).toEqual({ send: false, reason: 'trainer_gone' });
    });

    test('a classic reminder whose trainer turned reminders off is not sent', async () => {
        // Arrange
        const { guard } = createGuard({ userActive: true, trainer: { mode: TrainerMode.CLASSIC, reminderDisabled: true } });

        // Act
        const decision = await guard.check(row());

        // Assert
        expect(decision).toEqual({ send: false, reason: 'reminder_disabled' });
    });

    test('a classic reminder for a trainer that is no longer classic is not sent', async () => {
        // Arrange
        const { guard } = createGuard({ userActive: true, trainer: { mode: TrainerMode.FSRS, reminderDisabled: false } });

        // Act
        const decision = await guard.check(row());

        // Assert
        expect(decision).toEqual({ send: false, reason: 'trainer_not_classic' });
    });

    test('a reminder of an inactive user is not sent, whatever the trainer says', async () => {
        // Arrange
        const { guard } = createGuard({ userActive: false, trainer: { mode: TrainerMode.CLASSIC, reminderDisabled: false } });

        // Act
        const decision = await guard.check(row());

        // Assert
        expect(decision).toEqual({ send: false, reason: 'user_inactive' });
    });

    test('a classic reminder that still matches is sent', async () => {
        // Arrange
        const { guard } = createGuard({ userActive: true, trainer: { mode: TrainerMode.CLASSIC, reminderDisabled: false } });

        // Act
        const decision = await guard.check(row());

        // Assert
        expect(decision).toEqual({ send: true });
    });

    test('an FSRS reminder is left to its own prepare step, apart from the user check', async () => {
        // Arrange
        const { guard, reminderScheduleRepository } = createGuard({ userActive: true, trainer: null });

        // Act
        const decision = await guard.check(row({ template: 'fsrs_due_reminder' }));

        // Assert
        expect(decision).toEqual({ send: true });
        expect(reminderScheduleRepository.findSendGuardState).toHaveBeenCalledWith('u1', 't1');
    });

    test('a row without an owner is not sent', async () => {
        // Arrange
        const { guard } = createGuard({ userActive: true, trainer: null });

        // Act
        const decision = await guard.check(row({ userId: null }));

        // Assert
        expect(decision).toEqual({ send: false, reason: 'missing_user' });
    });
});
