import { captureSentryException } from '@/shared/utils/sentry.util';
import { NotificationAction, NotificationType, PriorityLevel, ReminderScheduleKind, ReminderScheduleStatus } from '@prisma/client';
import { ReminderInAppNotificationService } from './reminder-in-app-notification.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const CLASSIC_TEMPLATE = 'exam_reminder';
const FSRS_TEMPLATE = 'fsrs_due_reminder';

function reminderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 's1',
        status: ReminderScheduleStatus.SENT,
        reminderType: ReminderScheduleKind.INITIAL,
        template: CLASSIC_TEMPLATE,
        userId: 'u1',
        entityType: 'vocab_trainer',
        entityId: 't1',
        recipient: 'learner@example.com',
        payload: {},
        ...overrides,
    };
}

function createFakes(options: { trainer?: { name: string; questionType: string } | null; createError?: Error; pushError?: Error } = {}) {
    const notificationService = {
        create: options.createError ? jest.fn().mockRejectedValue(options.createError) : jest.fn().mockResolvedValue({ id: 'n1' }),
    };
    const gateway = {
        sendToUser: jest.fn(() => {
            if (options.pushError) {
                throw options.pushError;
            }
        }),
    };
    const reminders = {
        findTrainerBrief: jest.fn().mockResolvedValue(options.trainer === undefined ? { name: 'Vocab A', questionType: 'FLIP_CARD' } : options.trainer),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const service = new ReminderInAppNotificationService(notificationService as never, gateway as never, reminders as never, logger as never);

    return { service, notificationService, gateway, reminders, logger };
}

describe('ReminderInAppNotificationService.notifyReminderSent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saves a classic reminder as a VOCAB_TRAINER REMIND notification for its user', async () => {
        // Arrange
        const { service, notificationService } = createFakes();

        // Act
        await service.notifyReminderSent(reminderRow() as never, { testName: 'Exam words' });

        // Assert
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                priority: PriorityLevel.LOW,
                recipientUserIds: ['u1'],
                isActive: true,
                data: expect.objectContaining({
                    trainerId: 't1',
                    trainerName: 'Vocab A',
                    questionType: 'FLIP_CARD',
                    kind: 'INITIAL',
                    scheduleId: 's1',
                }),
            }),
        );
    });

    it('marks an escalation with kind ESCALATION and MEDIUM priority', async () => {
        // Arrange
        const { service, notificationService } = createFakes();

        // Act
        await service.notifyReminderSent(reminderRow({ reminderType: ReminderScheduleKind.ESCALATION }) as never, {});

        // Assert
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                priority: PriorityLevel.MEDIUM,
                data: expect.objectContaining({ kind: 'ESCALATION' }),
            }),
        );
    });

    it('marks an FSRS due reminder with kind FSRS_DUE and says there are cards to review', async () => {
        // Arrange
        const { service, notificationService } = createFakes();

        // Act
        await service.notifyReminderSent(reminderRow({ template: FSRS_TEMPLATE }) as never, { trainerName: 'Vocab A' });

        // Assert
        expect(notificationService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    kind: 'FSRS_DUE',
                    message: expect.stringContaining('cards to review'),
                }),
            }),
        );
    });

    it('falls back to the name in the email data and leaves out questionType when the trainer is gone', async () => {
        // Arrange
        const { service, notificationService } = createFakes({ trainer: null });

        // Act
        await service.notifyReminderSent(reminderRow() as never, { testName: 'Old name' });

        // Assert
        const [input] = notificationService.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
        expect(input.data.trainerName).toBe('Old name');
        expect(input.data).not.toHaveProperty('questionType');
    });

    it('looks the trainer up under the owner of the reminder', async () => {
        // Arrange
        const { service, reminders } = createFakes();

        // Act
        await service.notifyReminderSent(reminderRow() as never, {});

        // Assert
        expect(reminders.findTrainerBrief).toHaveBeenCalledWith('u1', 't1');
    });

    it('pushes the reminder to the user after the row is saved', async () => {
        // Arrange
        const { service, gateway } = createFakes();

        // Act
        await service.notifyReminderSent(reminderRow() as never, {});

        // Assert
        expect(gateway.sendToUser).toHaveBeenCalledWith(
            'u1',
            'reminder',
            expect.objectContaining({
                id: 'n1',
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                kind: 'INITIAL',
            }),
        );
    });

    it('does nothing for a row without a user or a trainer', async () => {
        // Arrange
        const { service, notificationService, gateway } = createFakes();

        // Act
        await service.notifyReminderSent(reminderRow({ userId: null }) as never, {});

        // Assert
        expect(notificationService.create).not.toHaveBeenCalled();
        expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('logs and reports a failed save without throwing', async () => {
        // Arrange
        const failure = new Error('database down');
        const { service, logger } = createFakes({ createError: failure });

        // Act
        await expect(service.notifyReminderSent(reminderRow() as never, {})).resolves.toBeUndefined();

        // Assert
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('database down'));
        expect(captureSentryException).toHaveBeenCalledWith(failure, expect.anything());
    });

    it('logs a failed push without failing the reminder, because the row is already saved', async () => {
        // Arrange
        const { service, logger } = createFakes({ pushError: new Error('socket closed') });

        // Act
        await expect(service.notifyReminderSent(reminderRow() as never, {})).resolves.toBeUndefined();

        // Assert
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('socket closed'));
    });
});
