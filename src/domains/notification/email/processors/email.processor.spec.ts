import { ReminderScheduleKind, ReminderScheduleStatus } from '@prisma/client';
import { EmailProcessor } from './email.processor';

interface ReminderRow {
    id: string;
    status: ReminderScheduleStatus;
    reminderType: ReminderScheduleKind;
    template: string;
    userId: string;
    entityType: string;
    entityId: string;
    recipient: string;
    payload: Record<string, string>;
    attempt: number;
    actedCheckAfter: Date | null;
    initialReminderId: string | null;
    dedupeKey: string;
    chainCount: number;
    chainMax: number;
    cancelReason: string | null;
}

function reminderRow(overrides: Partial<ReminderRow> = {}): ReminderRow {
    return {
        id: 's1',
        status: ReminderScheduleStatus.QUEUED,
        reminderType: ReminderScheduleKind.INITIAL,
        template: 'exam_reminder',
        userId: 'u1',
        entityType: 'vocab_trainer',
        entityId: 't1',
        recipient: 'learner@example.com',
        payload: { firstName: 'Ann', testName: 'Exam words', examUrl: 'https://app.example/exam' },
        attempt: 0,
        actedCheckAfter: null,
        initialReminderId: null,
        dedupeKey: 'k1',
        chainCount: 1,
        chainMax: 3,
        cancelReason: null,
        ...overrides,
    };
}

function createFakes(
    options: {
        row?: Partial<ReminderRow>;
        markedSent?: number;
        sendError?: Error;
        acted?: boolean;
        fsrs?: { send: true; data?: Record<string, string> } | { send: false; reason: string };
        guard?: { send: true } | { send: false; reason: string };
    } = {},
) {
    const row = reminderRow(options.row);
    const reminders = {
        findById: jest.fn().mockResolvedValue(row),
        findByIdWithClient: jest.fn().mockResolvedValue(row),
        transitionStatus: jest.fn().mockResolvedValue(true),
        inTransaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
        markSentIfStillSending: jest.fn().mockResolvedValue(options.markedSent ?? 1),
        createEscalationsForInitial: jest.fn().mockResolvedValue(undefined),
        cancelSiblingEscalations: jest.fn().mockResolvedValue(0),
        recordFailedAttempt: jest.fn().mockResolvedValue(true),
    };
    const emailService = {
        sendReminderEmail: options.sendError ? jest.fn().mockRejectedValue(options.sendError) : jest.fn().mockResolvedValue(undefined),
    };
    const actedCheckRegistry = { hasActedSince: jest.fn().mockResolvedValue(options.acted ?? false) };
    const fsrsReminderService = { prepareSend: jest.fn().mockResolvedValue(options.fsrs ?? { send: true, data: {} }), sync: jest.fn() };
    const inApp = { notifyReminderSent: jest.fn().mockResolvedValue(undefined) };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const sendGuard = { check: jest.fn().mockResolvedValue(options.guard ?? { send: true }) };

    const processor = new EmailProcessor(
        emailService as never,
        logger as never,
        reminders as never,
        actedCheckRegistry as never,
        fsrsReminderService as never,
        inApp as never,
        sendGuard as never,
    );

    return { processor, reminders, emailService, inApp, sendGuard, logger };
}

const jobFor = (scheduleId: string) => ({ data: { scheduleId } }) as never;

describe('EmailProcessor.handleReminderScheduleEmail: bell row', () => {
    it('creates the bell row once, after the email went out', async () => {
        // Arrange
        const { processor, emailService, inApp } = createFakes();

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).toHaveBeenCalledTimes(1);
        expect(inApp.notifyReminderSent).toHaveBeenCalledTimes(1);
        expect(inApp.notifyReminderSent).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', userId: 'u1' }));
        const sentOrder = emailService.sendReminderEmail.mock.invocationCallOrder[0] ?? 0;
        const bellOrder = inApp.notifyReminderSent.mock.invocationCallOrder[0] ?? 0;
        expect(sentOrder).toBeLessThan(bellOrder);
    });

    it('creates no bell row when another worker already marked the schedule sent', async () => {
        // Arrange: markSentIfStillSending reports that this worker did not win the SENT update.
        const { processor, inApp } = createFakes({ markedSent: 0 });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(inApp.notifyReminderSent).not.toHaveBeenCalled();
    });

    it('creates no bell row when the email fails, and schedules a retry instead', async () => {
        // Arrange
        const { processor, reminders, inApp } = createFakes({ sendError: new Error('SMTP unavailable') });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(inApp.notifyReminderSent).not.toHaveBeenCalled();
        expect(reminders.recordFailedAttempt).toHaveBeenCalledTimes(1);
    });

    it('creates no bell row and sends no email when the escalation was acted on before it was due', async () => {
        // Arrange
        const { processor, emailService, inApp } = createFakes({
            row: {
                reminderType: ReminderScheduleKind.ESCALATION,
                actedCheckAfter: new Date('2026-10-01T00:00:00.000Z'),
            },
            acted: true,
        });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(inApp.notifyReminderSent).not.toHaveBeenCalled();
    });
});

describe('EmailProcessor.handleReminderScheduleEmail: send guard', () => {
    it('cancels a reminder whose trainer or user no longer matches, and sends nothing', async () => {
        // Arrange
        const { processor, emailService, reminders, inApp } = createFakes({ guard: { send: false, reason: 'trainer_gone' } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(inApp.notifyReminderSent).not.toHaveBeenCalled();
        expect(reminders.transitionStatus).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.SENDING,
            ReminderScheduleStatus.CANCELLED,
            expect.objectContaining({ cancelReason: 'trainer_gone' }),
        );
    });

    it('sends a reminder that still matches', async () => {
        // Arrange
        const { processor, emailService } = createFakes({ guard: { send: true } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).toHaveBeenCalledTimes(1);
    });
});

describe('EmailProcessor.handleReminderScheduleEmail: failed send', () => {
    it('records the failure as a retry for the next attempt, with the error text', async () => {
        // Arrange
        const { processor, reminders } = createFakes({ sendError: new Error('SMTP unavailable') });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(reminders.recordFailedAttempt).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.SENDING,
            expect.objectContaining({ terminal: false, nextAttempt: 1 }),
            'retryable',
            'SMTP unavailable',
        );
    });
});

describe('EmailProcessor.handleReminderScheduleEmail: idempotency key', () => {
    it('sends a classic reminder with the schedule id as its idempotency key', async () => {
        // Arrange
        const { processor, emailService } = createFakes();

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).toHaveBeenCalledWith('learner@example.com', 'Vocab Trainer', 'exam_reminder', expect.any(Object), 's1');
    });

    it('sends an FSRS reminder without an idempotency key', async () => {
        // Arrange
        const { processor, emailService } = createFakes({ row: { template: 'fsrs_due_reminder' }, fsrs: { send: true, data: { firstName: 'Ann' } } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        const [, , , , idempotencyKey] = emailService.sendReminderEmail.mock.calls[0] ?? [];
        expect(idempotencyKey).toBeUndefined();
    });
});

describe('EmailProcessor.handleReminderScheduleEmail: skipped reminders are logged', () => {
    it('writes one info line with the schedule, the entity and the reason when the send guard skips a reminder', async () => {
        // Arrange
        const { processor, emailService, logger } = createFakes({ guard: { send: false, reason: 'trainer_gone' } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason trainer_gone/));
    });

    it('writes one info line when the FSRS prepare step skips a reminder', async () => {
        // Arrange
        const { processor, emailService, logger } = createFakes({ row: { template: 'fsrs_due_reminder' }, fsrs: { send: false, reason: 'reminder_disabled' } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason reminder_disabled/));
    });

    it('writes one info line when the user acted before the escalation was due', async () => {
        // Arrange
        const { processor, emailService, logger } = createFakes({
            row: { reminderType: ReminderScheduleKind.ESCALATION, actedCheckAfter: new Date('2026-10-01T00:00:00.000Z') },
            acted: true,
        });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason user_acted_before_send/));
    });

    it('writes one info line with the reason when the schedule was cancelled before its job ran', async () => {
        // Arrange
        const { processor, emailService, logger } = createFakes({ row: { status: ReminderScheduleStatus.CANCELLED, cancelReason: 'exam_submitted' } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason exam_submitted/));
    });

    it('writes one info line with the status as the reason when an expired schedule has no cancel reason', async () => {
        // Arrange
        const { processor, emailService, logger } = createFakes({ row: { status: ReminderScheduleStatus.EXPIRED, cancelReason: null } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason expired/));
    });

    it('writes one info line with the reason when a cancel lands between the first read and the status change', async () => {
        // Arrange
        const { processor, emailService, logger, reminders } = createFakes();
        const cancelled = reminderRow({ status: ReminderScheduleStatus.CANCELLED, cancelReason: 'exam_submitted' });
        reminders.findById.mockResolvedValueOnce(reminderRow()).mockResolvedValueOnce(cancelled);
        reminders.transitionStatus.mockResolvedValueOnce(false);

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason exam_submitted/));
    });

    it('writes one info line with the reason when a cancel lands before a pending schedule is queued', async () => {
        // Arrange
        const { processor, emailService, logger, reminders } = createFakes();
        const pending = reminderRow({ status: ReminderScheduleStatus.PENDING });
        const cancelled = reminderRow({ status: ReminderScheduleStatus.CANCELLED, cancelReason: 'trainer_gone' });
        reminders.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(cancelled);
        reminders.transitionStatus.mockResolvedValueOnce(false);

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/schedule s1.*entity t1.*reason trainer_gone/));
    });

    it('stays silent when another worker moved the schedule to SENDING first', async () => {
        // Arrange
        const { processor, emailService, logger, reminders } = createFakes();
        const sending = reminderRow({ status: ReminderScheduleStatus.SENDING });
        reminders.findById.mockResolvedValueOnce(reminderRow()).mockResolvedValueOnce(sending);
        reminders.transitionStatus.mockResolvedValueOnce(false);

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('stays silent when the schedule was already sent', async () => {
        // Arrange
        const { processor, emailService, logger } = createFakes({ row: { status: ReminderScheduleStatus.SENT } });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });
});

describe('EmailProcessor.handleReminderScheduleEmail: status-based retry rule', () => {
    const failWithStatus = (statusCode: number | null) =>
        createFakes({ sendError: Object.assign(new Error('Resend rejected the request'), { name: 'validation_error', statusCode }) });

    it.each([400, 422])('makes a %i terminal at once', async (statusCode) => {
        // Arrange
        const { processor, reminders } = failWithStatus(statusCode);

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(reminders.recordFailedAttempt).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.SENDING,
            expect.objectContaining({ terminal: true }),
            expect.any(String),
            expect.any(String),
        );
    });

    it.each([429, 409, 500, 503, null])('retries when the status is %s', async (statusCode) => {
        // Arrange
        const { processor, reminders } = failWithStatus(statusCode);

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(reminders.recordFailedAttempt).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.SENDING,
            expect.objectContaining({ terminal: false }),
            expect.any(String),
            expect.any(String),
        );
    });

    it('does not read the message text: an error with no status retries even if it says invalid', async () => {
        // Arrange
        const { processor, reminders } = createFakes({ sendError: new Error('invalid recipient in local queue') });

        // Act
        await processor.handleReminderScheduleEmail(jobFor('s1'));

        // Assert
        expect(reminders.recordFailedAttempt).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.SENDING,
            expect.objectContaining({ terminal: false }),
            expect.any(String),
            expect.any(String),
        );
    });
});
