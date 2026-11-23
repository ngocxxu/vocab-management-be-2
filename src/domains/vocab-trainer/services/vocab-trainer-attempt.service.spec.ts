import { TrainerMode, TrainerStatus, VocabTrainer } from '@prisma/client';
import { VocabTrainerAttemptService } from './vocab-trainer-attempt.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const SUBMITTED_AT = new Date('2026-11-23T10:00:00.000Z');
const USER = { id: 'u1', email: 'learner@example.com', firstName: 'Ada', lastName: 'Lovelace' };

function trainerRow(overrides: Partial<VocabTrainer> = {}): VocabTrainer {
    return {
        id: 't1',
        name: 'Week 1',
        status: TrainerStatus.PENDING,
        countTime: 0,
        setCountTime: 0,
        reminderTime: 0,
        reminderDisabled: false,
        reminderRepeat: 2,
        reminderLastRemind: new Date('2026-11-01T00:00:00.000Z'),
        reminderSpacingDays: 2,
        reminderMaxRepeat: 6,
        reminderFailStreak: 0,
        reminderLastCountedAt: null,
        lastExamSubmittedAt: null,
        mode: TrainerMode.CLASSIC,
        userId: 'u1',
        ...overrides,
    } as unknown as VocabTrainer;
}

function createFakes(options: { notificationError?: Error; hideError?: Error } = {}) {
    const repo = {
        findVocabTrainerByIdMinimal: jest.fn(),
        deleteVocabTrainerRow: jest.fn().mockResolvedValue(undefined),
        updateVocabTrainerWithIncludes: jest.fn((_id: string, data: Record<string, unknown>) => trainerRow({ ...(data as Partial<VocabTrainer>) })),
    };
    const reminderAfterExam = {
        cancelSchedulesForTrainerTx: jest.fn().mockResolvedValue(undefined),
        syncRemindersAfterExamSubmission: jest.fn().mockResolvedValue(undefined),
    };
    const reminderInApp = {
        hideTrainerBells: options.hideError ? jest.fn().mockRejectedValue(options.hideError) : jest.fn().mockResolvedValue(undefined),
    };
    const notificationService = {
        create: options.notificationError ? jest.fn().mockRejectedValue(options.notificationError) : jest.fn().mockResolvedValue({ id: 'n1' }),
    };
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const reminderSchedules = { hasInFlightInitial: jest.fn().mockResolvedValue(false), findLatestFinalInitialAt: jest.fn().mockResolvedValue(null) };
    const service = new VocabTrainerAttemptService(
        repo as never,
        reminderAfterExam as never,
        reminderInApp as never,
        notificationService as never,
        logger as never,
        reminderSchedules as never,
    );

    return { service, repo, reminderAfterExam, reminderInApp, notificationService, logger, reminderSchedules };
}

const applyInput = (trainer: VocabTrainer, overrides: Partial<Parameters<VocabTrainerAttemptService['applyAttemptTx']>[1]> = {}) => ({
    trainer,
    user: USER,
    overallStatus: TrainerStatus.PASSED,
    counts: true,
    submittedAt: SUBMITTED_AT,
    countTime: 120,
    examUrl: 'https://app.example.com/t1/exam/multiple-choice',
    ...overrides,
});

describe('VocabTrainerAttemptService.applyAttemptTx', () => {
    test('a counted pass adds one Pass and schedules the next reminder with the trainer spacing', async () => {
        // Arrange
        const { service, repo, reminderAfterExam } = createFakes();
        const trainer = trainerRow({ reminderRepeat: 2, reminderSpacingDays: 5 });

        // Act
        const outcome = await service.applyAttemptTx({} as never, applyInput(trainer));

        // Assert
        expect(outcome.completed).toBe(false);
        expect(repo.updateVocabTrainerWithIncludes).toHaveBeenCalledWith(
            't1',
            expect.objectContaining({ reminderRepeat: 3, reminderFailStreak: 0, lastExamSubmittedAt: SUBMITTED_AT }),
            {},
        );
        expect(reminderAfterExam.syncRemindersAfterExamSubmission).toHaveBeenCalledWith({}, expect.objectContaining({ trainerId: 't1', spacingDays: 5, reminderDisabled: false }));
    });

    test('a counted attempt stamps the reminders it cancels with the attempt time', async () => {
        // Arrange
        const { service, reminderAfterExam } = createFakes();

        // Act
        await service.applyAttemptTx({} as never, applyInput(trainerRow()));

        // Assert: a cancel at the same instant as the count must not open the next Pass
        expect(reminderAfterExam.syncRemindersAfterExamSubmission).toHaveBeenCalledWith({}, expect.objectContaining({ submittedAt: SUBMITTED_AT }));
    });

    test('a repeated attempt that does not count never adds a Pass and leaves the reminders alone', async () => {
        // Arrange
        const { service, repo, reminderAfterExam } = createFakes();
        const trainer = trainerRow({ reminderRepeat: 2 });

        // Act
        const outcome = await service.applyAttemptTx({} as never, applyInput(trainer, { counts: false }));

        // Assert
        expect(outcome.passes).toBe(2);
        expect(repo.updateVocabTrainerWithIncludes).toHaveBeenCalledWith('t1', expect.objectContaining({ reminderRepeat: 2, lastExamSubmittedAt: SUBMITTED_AT }), {});
        expect(repo.updateVocabTrainerWithIncludes.mock.calls[0][1]).not.toHaveProperty('reminderLastCountedAt');
        expect(reminderAfterExam.syncRemindersAfterExamSubmission).not.toHaveBeenCalled();
        expect(reminderAfterExam.cancelSchedulesForTrainerTx).not.toHaveBeenCalled();
    });

    test('reaching T completes the trainer: it is removed and its reminders are cancelled, in the same transaction', async () => {
        // Arrange
        const { service, repo, reminderAfterExam } = createFakes();
        const trainer = trainerRow({ reminderRepeat: 5, reminderMaxRepeat: 6 });

        // Act
        const outcome = await service.applyAttemptTx({} as never, applyInput(trainer));

        // Assert
        expect(outcome.completed).toBe(true);
        expect(outcome.passes).toBe(6);
        expect(outcome.maxRepeat).toBe(6);
        expect(reminderAfterExam.cancelSchedulesForTrainerTx).toHaveBeenCalledWith({}, 't1', 'u1', 'trainer_completed_max_passes');
        expect(repo.deleteVocabTrainerRow).toHaveBeenCalledWith('t1', {});
        expect(repo.updateVocabTrainerWithIncludes).not.toHaveBeenCalled();
        expect(reminderAfterExam.syncRemindersAfterExamSubmission).not.toHaveBeenCalled();
    });

    test('three counted failures in a row raise the prompt by moving the streak to 3', async () => {
        // Arrange
        const { service, repo } = createFakes();
        const trainer = trainerRow({ reminderFailStreak: 2 });

        // Act
        await service.applyAttemptTx({} as never, applyInput(trainer, { overallStatus: TrainerStatus.FAILED }));

        // Assert
        expect(repo.updateVocabTrainerWithIncludes).toHaveBeenCalledWith('t1', expect.objectContaining({ reminderFailStreak: 3, reminderRepeat: 2 }), {});
    });

    test('a repeated pass that does not count does not add a Pass even when it is the one that would reach T', async () => {
        // Arrange
        const { service, repo } = createFakes();
        const trainer = trainerRow({ reminderRepeat: 5, reminderMaxRepeat: 6 });

        // Act
        const outcome = await service.applyAttemptTx({} as never, applyInput(trainer, { counts: false }));

        // Assert
        expect(outcome.completed).toBe(false);
        expect(repo.deleteVocabTrainerRow).not.toHaveBeenCalled();
    });

    test('a counted attempt with reminders off records the count time and does not schedule anything', async () => {
        // Arrange
        const { service, repo, reminderAfterExam } = createFakes();
        const trainer = trainerRow({ reminderDisabled: true });

        // Act
        await service.applyAttemptTx({} as never, applyInput(trainer));

        // Assert
        expect(repo.updateVocabTrainerWithIncludes).toHaveBeenCalledWith('t1', expect.objectContaining({ reminderLastCountedAt: SUBMITTED_AT }), {});
        expect(reminderAfterExam.syncRemindersAfterExamSubmission).toHaveBeenCalledWith({}, expect.objectContaining({ reminderDisabled: true }));
    });
});

describe('VocabTrainerAttemptService.afterCommit', () => {
    test('a completed trainer gets a completion bell that shows the real T and hides its reminder bells', async () => {
        // Arrange
        const { service, notificationService, reminderInApp } = createFakes();
        const outcome = { completed: true, passed: true, trainerId: 't1', trainerName: 'Week 1', userId: 'u1', maxRepeat: 9, passes: 9 };

        // Act
        await service.afterCommit(outcome);

        // Assert
        expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith('t1');
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ message: 'Your test has been completed after 9 passes' }), recipientUserIds: ['u1'] }),
        );
    });

    test('a passed attempt hides the reminder bells of the trainer and creates no completion bell', async () => {
        // Arrange
        const { service, notificationService, reminderInApp } = createFakes();

        // Act
        await service.afterCommit({ completed: false, passed: true, trainerId: 't1', trainerName: 'Week 1', userId: 'u1', maxRepeat: 6, passes: 3 });

        // Assert
        expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith('t1');
        expect(notificationService.create).not.toHaveBeenCalled();
    });

    test('a failure in the bell step is logged, never thrown to the user', async () => {
        // Arrange
        const { service, logger } = createFakes({ notificationError: new Error('bell down'), hideError: new Error('hide down') });

        // Act
        const attempt = service.afterCommit({ completed: true, passed: true, trainerId: 't1', trainerName: 'Week 1', userId: 'u1', maxRepeat: 6, passes: 6 });

        // Assert
        await expect(attempt).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalled();
    });
});

describe('VocabTrainerAttemptService.resolveCountsAsAttempt', () => {
    test('a repeat while a reminder is pending does not count', async () => {
        // Arrange
        const { service, reminderSchedules, repo } = createFakes();
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderLastCountedAt: new Date(SUBMITTED_AT.getTime() - 60_000) }));
        reminderSchedules.findLatestFinalInitialAt.mockResolvedValue(null);

        // Act
        const counts = await service.resolveCountsAsAttempt('t1', undefined, SUBMITTED_AT);

        // Assert
        expect(counts).toBe(false);
    });

    test('a Pass counts once a reminder reached a final state after the last count', async () => {
        // Arrange
        const { service, reminderSchedules, repo } = createFakes();
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderLastCountedAt: new Date(SUBMITTED_AT.getTime() - 3_600_000) }));
        reminderSchedules.findLatestFinalInitialAt.mockResolvedValue(new Date(SUBMITTED_AT.getTime() - 60_000));

        // Act
        const counts = await service.resolveCountsAsAttempt('t1', undefined, SUBMITTED_AT);

        // Assert
        expect(counts).toBe(true);
    });

    test('the final-state lookup runs under the caller transaction', async () => {
        // Arrange
        const { service, reminderSchedules, repo } = createFakes();
        const tx = { tag: 'tx' } as never;
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderLastCountedAt: new Date(SUBMITTED_AT.getTime() - 60_000) }));

        // Act
        await service.resolveCountsAsAttempt('t1', tx, SUBMITTED_AT);

        // Assert
        expect(reminderSchedules.findLatestFinalInitialAt).toHaveBeenCalledWith('t1', tx);
    });

    test('with reminders off, the second attempt within 24 hours does not count', async () => {
        // Arrange
        const { service, repo } = createFakes();
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderDisabled: true, reminderLastCountedAt: new Date(SUBMITTED_AT.getTime() - 60_000) }));

        // Act
        const counts = await service.resolveCountsAsAttempt('t1', undefined, SUBMITTED_AT);

        // Assert
        expect(counts).toBe(false);
    });

    test('the in-flight lookup runs under the caller transaction, with reminders on too', async () => {
        // Arrange
        const { service, repo, reminderSchedules } = createFakes();
        const tx = { tag: 'tx' } as never;
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderLastCountedAt: new Date(SUBMITTED_AT.getTime() - 60_000) }));

        // Act
        await service.resolveCountsAsAttempt('t1', tx, SUBMITTED_AT);

        // Assert
        expect(reminderSchedules.hasInFlightInitial).toHaveBeenCalledWith('t1', tx);
    });

    test('the first Pass is blocked while a classic reminder is in flight', async () => {
        // Arrange
        const { service, repo, reminderSchedules } = createFakes();
        reminderSchedules.hasInFlightInitial.mockResolvedValue(true);
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderLastCountedAt: null }));

        // Act
        const counts = await service.resolveCountsAsAttempt('t1', undefined, SUBMITTED_AT);

        // Assert
        expect(counts).toBe(false);
    });

    test('a Pass is blocked while a reminder is SENDING, even after a final state came after the last count', async () => {
        // Arrange
        const { service, repo, reminderSchedules } = createFakes();
        reminderSchedules.hasInFlightInitial.mockResolvedValue(true);
        reminderSchedules.findLatestFinalInitialAt.mockResolvedValue(new Date(SUBMITTED_AT.getTime() - 60_000));
        repo.findVocabTrainerByIdMinimal = jest.fn().mockResolvedValue(trainerRow({ reminderLastCountedAt: new Date(SUBMITTED_AT.getTime() - 3_600_000) }));

        // Act
        const counts = await service.resolveCountsAsAttempt('t1', undefined, SUBMITTED_AT);

        // Assert
        expect(counts).toBe(false);
    });
});
