import { captureSentryException } from '@/shared/utils/sentry.util';
import { GradingNotificationService } from './grading-notification.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const trainerId = 'trainer-1';
const userId = 'user-1';

interface SetupOptions {
    attempt?: { regradeCount: number } | null;
    trainer?: { name: string } | null;
    createError?: Error;
    hideError?: Error;
}

function setup(options: SetupOptions = {}) {
    const attempt = options.attempt === undefined ? { regradeCount: 0 } : options.attempt;
    const trainer = options.trainer === undefined ? { name: 'Animals' } : options.trainer;
    const repository = {
        findAttemptByTrainerId: jest.fn().mockResolvedValue(attempt),
        findVocabTrainerByIdForUserMinimal: jest.fn().mockResolvedValue(trainer),
    };
    const notificationService = {
        create: options.createError ? jest.fn().mockRejectedValue(options.createError) : jest.fn().mockResolvedValue({}),
        hideAllTrainerBells: options.hideError ? jest.fn().mockRejectedValue(options.hideError) : jest.fn().mockResolvedValue(1),
    };
    const gateway = { sendToUser: jest.fn() };
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const service = new GradingNotificationService(notificationService as never, gateway as never, repository as never, logger as never);

    return { service, repository, notificationService, gateway, logger };
}

describe('GradingNotificationService.notifyGraded', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates a VOCAB_TRAINER bell for the user and pushes it over the socket', async () => {
        // Arrange
        const { service, notificationService, gateway } = setup();
        const data = { kind: 'EXAM_GRADED', trainerId, trainerName: 'Animals', examType: 'translation-audio' };

        // Act
        await service.notifyGraded({ trainerId, userId, trainerName: 'Animals', examType: 'translation-audio' });

        // Assert
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'VOCAB_TRAINER',
                action: 'CREATE',
                priority: 'MEDIUM',
                isActive: true,
                recipientUserIds: [userId],
                data,
            }),
        );
        expect(gateway.sendToUser).toHaveBeenCalledWith(userId, 'EXAM_GRADED', data);
        expect(notificationService.hideAllTrainerBells).not.toHaveBeenCalled();
    });

    it('hides the bell and does not push when the trainer is deleted during the insert', async () => {
        // Arrange: the trainer is gone when the bell step checks it after the insert.
        const { service, notificationService, gateway, repository } = setup({ trainer: null });

        // Act
        await service.notifyGraded({ trainerId, userId, trainerName: 'Animals', examType: 'translation-audio' });

        // Assert
        expect(notificationService.create).toHaveBeenCalledTimes(1);
        expect(repository.findVocabTrainerByIdForUserMinimal).toHaveBeenCalledWith(trainerId, userId);
        expect(notificationService.hideAllTrainerBells).toHaveBeenCalledWith(trainerId);
        expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('logs a failed hide and never throws into the grading job', async () => {
        // Arrange
        const { service, logger } = setup({ trainer: null, hideError: new Error('hide down') });

        // Act
        await expect(service.notifyGraded({ trainerId, userId, trainerName: 'Animals', examType: 'fill-in-blank' })).resolves.toBeUndefined();

        // Assert
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('hide down'));
    });

    it('swallows a failed create: logs it, reports to Sentry, never throws', async () => {
        // Arrange
        const error = new Error('db down');
        const { service, gateway, logger } = setup({ createError: error });

        // Act
        await expect(service.notifyGraded({ trainerId, userId, trainerName: 'Animals', examType: 'fill-in-blank' })).resolves.toBeUndefined();

        // Assert
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('db down'));
        expect(captureSentryException).toHaveBeenCalledWith(error, expect.anything());
        expect(gateway.sendToUser).not.toHaveBeenCalled();
    });
});

describe('GradingNotificationService.notifyFailed', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('notifies on the first failure of a submit, using the trainer name from the database', async () => {
        // Arrange
        const { service, notificationService, gateway, repository } = setup({ attempt: { regradeCount: 0 }, trainer: { name: 'Colors' } });

        // Act
        await service.notifyFailed({ trainerId, userId, examType: 'fill-in-blank' });

        // Assert
        expect(repository.findAttemptByTrainerId).toHaveBeenCalledWith(trainerId, userId);
        expect(repository.findVocabTrainerByIdForUserMinimal).toHaveBeenCalledWith(trainerId, userId);
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { kind: 'EXAM_GRADING_FAILED', trainerId, trainerName: 'Colors', examType: 'fill-in-blank' },
            }),
        );
        expect(gateway.sendToUser).toHaveBeenCalledWith(userId, 'EXAM_GRADING_FAILED', expect.objectContaining({ trainerName: 'Colors' }));
    });

    it('stays silent for a failed regrade (regradeCount above zero): once per submit', async () => {
        // Arrange
        const { service, notificationService, gateway } = setup({ attempt: { regradeCount: 1 } });

        // Act
        await service.notifyFailed({ trainerId, userId, examType: 'translation-audio' });

        // Assert
        expect(notificationService.create).not.toHaveBeenCalled();
        expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('stays silent when the trainer no longer exists', async () => {
        // Arrange
        const { service, notificationService } = setup({ trainer: null });

        // Act
        await service.notifyFailed({ trainerId, userId, examType: 'fill-in-blank' });

        // Assert
        expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('stays silent when there is no attempt row', async () => {
        // Arrange
        const { service, notificationService } = setup({ attempt: null });

        // Act
        await service.notifyFailed({ trainerId, userId, examType: 'translation-audio' });

        // Assert
        expect(notificationService.create).not.toHaveBeenCalled();
    });

    it('hides the bell and does not push when the trainer is deleted during the insert of a failure bell', async () => {
        // Arrange: the pre-check finds the trainer, and the check after the insert does not.
        const { service, notificationService, gateway, repository } = setup({ attempt: { regradeCount: 0 } });
        repository.findVocabTrainerByIdForUserMinimal.mockResolvedValueOnce({ name: 'Colors' }).mockResolvedValueOnce(null);

        // Act
        await service.notifyFailed({ trainerId, userId, examType: 'fill-in-blank' });

        // Assert
        expect(notificationService.create).toHaveBeenCalledTimes(1);
        expect(notificationService.hideAllTrainerBells).toHaveBeenCalledWith(trainerId);
        expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('swallows a failed lookup: never throws into the job', async () => {
        // Arrange
        const { service, repository, logger } = setup();
        repository.findAttemptByTrainerId.mockRejectedValue(new Error('lookup failed'));

        // Act
        await expect(service.notifyFailed({ trainerId, userId, examType: 'fill-in-blank' })).resolves.toBeUndefined();

        // Assert
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('lookup failed'));
        expect(captureSentryException).toHaveBeenCalled();
    });
});
