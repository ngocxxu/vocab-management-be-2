import { TrainerMode, TrainerStatus, VocabTrainer } from '@prisma/client';
import { VocabTrainerBadRequestException, VocabTrainerNotFoundException } from '../exceptions';
import { VocabTrainerReminderService } from './vocab-trainer-reminder.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const USER_ID = 'u1';
const TRAINER_ID = 't1';

function trainerRow(overrides: Partial<VocabTrainer> = {}): VocabTrainer {
    return {
        id: TRAINER_ID,
        name: 'Week 1',
        status: TrainerStatus.PENDING,
        reminderDisabled: false,
        reminderRepeat: 2,
        reminderSpacingDays: 4,
        reminderMaxRepeat: 6,
        reminderFailStreak: 3,
        lastExamSubmittedAt: new Date('2026-11-20T09:00:00.000Z'),
        mode: TrainerMode.CLASSIC,
        userId: USER_ID,
        ...overrides,
    } as unknown as VocabTrainer;
}

function createFakes(options: { current?: VocabTrainer; inFlight?: boolean; contact?: boolean; cancelError?: Error } = {}) {
    const current = options.current ?? trainerRow();
    const repo = {
        inTransaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
        lockAndFindForUpdate: jest.fn().mockResolvedValue(current),
        updateVocabTrainerFields: jest.fn((_id: string, data: Record<string, unknown>) => ({ ...current, ...data })),
        findById: jest.fn().mockResolvedValue(current),
    };
    const reminderAfterExam = {
        cancelSchedulesForTrainerTx: jest.fn().mockResolvedValue(undefined),
        scheduleInitialTx: jest.fn().mockResolvedValue(undefined),
    };
    const reminderSchedules = {
        hasInFlightInitial: jest.fn().mockResolvedValue(options.inFlight ?? false),
        findUserContact: jest.fn().mockResolvedValue(options.contact === false ? null : { email: 'learner@example.com', firstName: 'Ada', lastName: 'Lovelace' }),
        cancelByEntity: options.cancelError ? jest.fn().mockRejectedValue(options.cancelError) : jest.fn().mockResolvedValue(0),
    };
    const reminderInApp = { hideTrainerBells: jest.fn().mockResolvedValue(undefined) };
    const fsrsReminder = { sync: jest.fn().mockResolvedValue(undefined) };
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const service = new VocabTrainerReminderService(
        repo as never,
        reminderAfterExam as never,
        reminderSchedules as never,
        reminderInApp as never,
        fsrsReminder as never,
        logger as never,
    );

    return { service, repo, reminderAfterExam, reminderSchedules, reminderInApp, fsrsReminder, logger };
}

describe('VocabTrainerReminderService.setRemindersEnabled', () => {
    test('turning reminders off cancels the pending reminders, resets the streak and hides the bells', async () => {
        // Arrange
        const { service, repo, reminderAfterExam, reminderInApp } = createFakes();

        // Act
        await service.setRemindersEnabled(TRAINER_ID, USER_ID, false);

        // Assert
        expect(repo.updateVocabTrainerFields).toHaveBeenCalledWith(TRAINER_ID, { reminderDisabled: true, reminderFailStreak: 0 }, {});
        expect(reminderAfterExam.cancelSchedulesForTrainerTx).toHaveBeenCalledWith({}, TRAINER_ID, USER_ID, 'reminders_turned_off');
        expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith(TRAINER_ID);
    });

    test('turning reminders on schedules the next one when there is a completed attempt and nothing is pending', async () => {
        // Arrange
        const { service, repo, reminderAfterExam, reminderSchedules } = createFakes({ current: trainerRow({ reminderDisabled: true }) });

        // Act
        await service.setRemindersEnabled(TRAINER_ID, USER_ID, true);

        // Assert
        expect(repo.updateVocabTrainerFields).toHaveBeenCalledWith(TRAINER_ID, { reminderDisabled: false, reminderFailStreak: 0 }, {});
        expect(reminderAfterExam.cancelSchedulesForTrainerTx).not.toHaveBeenCalled();
        expect(reminderAfterExam.scheduleInitialTx).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ trainerId: TRAINER_ID, userId: USER_ID, spacingDays: 4, reminderDisabled: false, userEmail: 'learner@example.com' }),
        );
        expect(reminderSchedules.hasInFlightInitial).toHaveBeenCalled();
    });

    test('turning reminders on schedules nothing when the trainer has no completed attempt yet', async () => {
        // Arrange
        const { service, reminderAfterExam } = createFakes({ current: trainerRow({ reminderDisabled: true, lastExamSubmittedAt: null }) });

        // Act
        await service.setRemindersEnabled(TRAINER_ID, USER_ID, true);

        // Assert
        expect(reminderAfterExam.scheduleInitialTx).not.toHaveBeenCalled();
    });

    test('turning reminders on schedules nothing when a reminder is already pending', async () => {
        // Arrange
        const { service, reminderAfterExam } = createFakes({ current: trainerRow({ reminderDisabled: true }), inFlight: true });

        // Act
        await service.setRemindersEnabled(TRAINER_ID, USER_ID, true);

        // Assert
        expect(reminderAfterExam.scheduleInitialTx).not.toHaveBeenCalled();
    });

    test('setting the value the trainer already has changes nothing', async () => {
        // Arrange
        const { service, repo, reminderInApp } = createFakes({ current: trainerRow({ reminderDisabled: false }) });

        // Act
        await service.setRemindersEnabled(TRAINER_ID, USER_ID, true);

        // Assert
        expect(repo.updateVocabTrainerFields).not.toHaveBeenCalled();
        expect(reminderInApp.hideTrainerBells).not.toHaveBeenCalled();
    });

    test('an FSRS trainer is handed to the FSRS reminder sync and never gets a classic reminder', async () => {
        // Arrange
        const { service, reminderAfterExam, fsrsReminder } = createFakes({ current: trainerRow({ mode: TrainerMode.FSRS, reminderDisabled: true }) });

        // Act
        await service.setRemindersEnabled(TRAINER_ID, USER_ID, true);

        // Assert
        expect(reminderAfterExam.scheduleInitialTx).not.toHaveBeenCalled();
        expect(fsrsReminder.sync).toHaveBeenCalledWith(USER_ID, TRAINER_ID);
    });
});

describe('VocabTrainerReminderService ownership', () => {
    test('a trainer of another user is not found and its reminders are left alone', async () => {
        // Arrange
        const { service, repo, reminderAfterExam, reminderInApp } = createFakes({ current: trainerRow({ userId: 'someone-else', reminderDisabled: false }) });

        // Act
        const attempt = service.setRemindersEnabled(TRAINER_ID, USER_ID, false);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(VocabTrainerNotFoundException);
        expect(repo.updateVocabTrainerFields).not.toHaveBeenCalled();
        expect(reminderAfterExam.cancelSchedulesForTrainerTx).not.toHaveBeenCalled();
        expect(reminderInApp.hideTrainerBells).not.toHaveBeenCalled();
    });
});

describe('VocabTrainerReminderService.answerReminderPrompt', () => {
    test('with no prompt pending, the trainer comes back unchanged', async () => {
        // Arrange
        const current = trainerRow({ reminderFailStreak: 1 });
        const { service, repo } = createFakes({ current });

        // Act
        const result = await service.answerReminderPrompt(TRAINER_ID, USER_ID, false);

        // Assert
        expect(result).toBe(current);
        expect(repo.updateVocabTrainerFields).not.toHaveBeenCalled();
    });

    test('Yes resets the streak and keeps reminders on', async () => {
        // Arrange
        const { service, repo, reminderInApp } = createFakes();

        // Act
        await service.answerReminderPrompt(TRAINER_ID, USER_ID, true);

        // Assert
        expect(repo.updateVocabTrainerFields).toHaveBeenCalledWith(TRAINER_ID, { reminderFailStreak: 0 });
        expect(reminderInApp.hideTrainerBells).not.toHaveBeenCalled();
    });

    test('No turns reminders off', async () => {
        // Arrange
        const { service, repo, reminderAfterExam } = createFakes();

        // Act
        await service.answerReminderPrompt(TRAINER_ID, USER_ID, false);

        // Assert
        expect(repo.updateVocabTrainerFields).toHaveBeenCalledWith(TRAINER_ID, { reminderDisabled: true, reminderFailStreak: 0 }, {});
        expect(reminderAfterExam.cancelSchedulesForTrainerTx).toHaveBeenCalledWith({}, TRAINER_ID, USER_ID, 'reminders_turned_off');
    });

    test('an FSRS trainer is rejected', async () => {
        // Arrange
        const { service } = createFakes({ current: trainerRow({ mode: TrainerMode.FSRS }) });

        // Act
        const attempt = service.answerReminderPrompt(TRAINER_ID, USER_ID, true);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(VocabTrainerBadRequestException);
    });

    test('an unknown trainer is not found', async () => {
        // Arrange
        const { service, repo } = createFakes();
        repo.findById.mockResolvedValue(null);

        // Act
        const attempt = service.answerReminderPrompt(TRAINER_ID, USER_ID, true);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(VocabTrainerNotFoundException);
    });
});

describe('VocabTrainerReminderService.onTrainerRemoved', () => {
    test('a deleted trainer cancels every open reminder and hides its bells', async () => {
        // Arrange
        const { service, reminderSchedules, reminderInApp } = createFakes();

        // Act
        await service.onTrainerRemoved(TRAINER_ID, USER_ID);

        // Assert
        expect(reminderSchedules.cancelByEntity).toHaveBeenCalledWith('vocab_trainer', TRAINER_ID, 'trainer_deleted', USER_ID);
        expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith(TRAINER_ID);
    });

    test('a failed cancel is logged, not thrown, because the trainer is already gone', async () => {
        // Arrange
        const { service, logger } = createFakes({ cancelError: new Error('db down') });

        // Act
        const attempt = service.onTrainerRemoved(TRAINER_ID, USER_ID);

        // Assert
        await expect(attempt).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalled();
    });
});
