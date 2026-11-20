import { captureSentryException } from '@/shared/utils/sentry.util';
import { ReminderScheduleStatus } from '@prisma/client';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { EEmailTemplate } from '../utils';
import { ReminderReconciliationService } from './reminder-reconciliation.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

interface FakeJob {
    getState: jest.Mock;
}

function fakeJob(state: string): FakeJob {
    return { getState: jest.fn().mockResolvedValue(state) };
}

function createReconciliation(
    options: {
        queued?: Array<{ id: string; attempt: number }>;
        job?: FakeJob;
        stalledFsrs?: Array<{ id: string; template: string }>;
        stalledClassic?: Array<{ id: string; attempt: number }>;
    } = {},
) {
    const producer = { getReminderScheduleJob: jest.fn().mockResolvedValue(options.job) };
    const repository = {
        releaseStaleClaims: jest.fn().mockResolvedValue(0),
        findQueuedOlderThan: jest.fn().mockResolvedValue(options.queued ?? []),
        recordFailedAttempt: jest.fn().mockResolvedValue(true),
        findStalledFsrsSending: jest.fn().mockResolvedValue(options.stalledFsrs ?? []),
        findStalledClassicSending: jest.fn().mockResolvedValue(options.stalledClassic ?? []),
        collapseOverdueEscalations: jest.fn().mockResolvedValue(0),
        findInitialSentRemindersBefore: jest.fn().mockResolvedValue([]),
    };
    const vocabTrainerRepository = { findLastExamSubmittedAt: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = new ReminderReconciliationService(producer as never, repository as never, vocabTrainerRepository as never, logger as never);

    return { service, producer, repository };
}

// The repo's .env sets REMINDER_RECONCILIATION_ENABLED=false, and jest loads .env, so tick() would do nothing. Enable it for these tests.
let savedReconciliationFlag: string | undefined;

beforeEach(() => {
    savedReconciliationFlag = process.env.REMINDER_RECONCILIATION_ENABLED;
    process.env.REMINDER_RECONCILIATION_ENABLED = 'true';
});

afterEach(() => {
    if (savedReconciliationFlag === undefined) {
        delete process.env.REMINDER_RECONCILIATION_ENABLED;
    } else {
        process.env.REMINDER_RECONCILIATION_ENABLED = savedReconciliationFlag;
    }
});

describe('ReminderReconciliationService: QUEUED rows without a live job', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('retries a QUEUED row that has no job, with one more attempt', async () => {
        // Arrange
        const { service, repository } = createReconciliation({ queued: [{ id: 's1', attempt: 0 }] });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.QUEUED,
            expect.objectContaining({ terminal: false, nextAttempt: 1 }),
            'orphaned_queue',
            expect.any(String),
        );
    });

    it('only looks at rows QUEUED for longer than the orphan age, oldest first', async () => {
        // Arrange
        const { service, repository } = createReconciliation();
        const before = Date.now();

        // Act
        await service.tick();

        // Assert
        const [olderThan, take] = repository.findQueuedOlderThan.mock.calls[0] as [Date, number];
        expect(olderThan.getTime()).toBeGreaterThanOrEqual(before - REMINDER_CONFIG.reconciliation.orphanedQueuedAfterMs);
        expect(olderThan.getTime()).toBeLessThanOrEqual(Date.now() - REMINDER_CONFIG.reconciliation.orphanedQueuedAfterMs);
        expect(take).toBe(50);
    });

    it.each(['waiting', 'delayed', 'active', 'paused', 'stuck'])('leaves a QUEUED row alone while its job is %s', async (state) => {
        // Arrange
        const { service, repository } = createReconciliation({ queued: [{ id: 's1', attempt: 0 }], job: fakeJob(state) });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it.each(['failed', 'completed'])('treats a %s job as no live job and retries the row', async (state) => {
        // Arrange
        const { service, repository } = createReconciliation({ queued: [{ id: 's1', attempt: 0 }], job: fakeJob(state) });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).toHaveBeenCalledTimes(1);
    });

    it('makes the retry terminal when it reaches the maximum attempts', async () => {
        // Arrange
        const { service, repository } = createReconciliation({ queued: [{ id: 's1', attempt: REMINDER_CONFIG.retry.maxAttempts - 1 }] });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).toHaveBeenCalledWith(
            's1',
            ReminderScheduleStatus.QUEUED,
            expect.objectContaining({ terminal: true, nextAttempt: REMINDER_CONFIG.retry.maxAttempts }),
            'orphaned_queue',
            expect.any(String),
        );
    });
});

describe('ReminderReconciliationService: stuck FSRS rows in SENDING', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reports a stuck FSRS row to Sentry and changes nothing', async () => {
        // Arrange
        const { service, repository } = createReconciliation({ stalledFsrs: [{ id: 'f1', template: EEmailTemplate.FSRS_DUE_REMINDER }] });

        // Act
        await service.tick();

        // Assert
        expect(captureSentryException).toHaveBeenCalledTimes(1);
        expect(repository.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it('reports the same stuck row only once while it stays stuck', async () => {
        // Arrange
        const { service } = createReconciliation({ stalledFsrs: [{ id: 'f1', template: EEmailTemplate.FSRS_DUE_REMINDER }] });

        // Act
        await service.tick();
        await service.tick();

        // Assert
        expect(captureSentryException).toHaveBeenCalledTimes(1);
    });
});

describe('ReminderReconciliationService: stuck classic rows in SENDING', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('retries a classic row stuck in SENDING with no live job, with one more attempt', async () => {
        // Arrange
        const { service, repository } = createReconciliation({ stalledClassic: [{ id: 'c1', attempt: 0 }] });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).toHaveBeenCalledWith(
            'c1',
            ReminderScheduleStatus.SENDING,
            expect.objectContaining({ terminal: false, nextAttempt: 1 }),
            'stuck_sending',
            expect.any(String),
        );
    });

    it('only looks at classic rows in SENDING for longer than the stall age', async () => {
        // Arrange
        const { service, repository } = createReconciliation();
        const before = Date.now();

        // Act
        await service.tick();

        // Assert
        const [olderThan, take] = repository.findStalledClassicSending.mock.calls[0] as [Date, number];
        expect(olderThan.getTime()).toBeGreaterThanOrEqual(before - REMINDER_CONFIG.reconciliation.stalledSendingAfterMs);
        expect(olderThan.getTime()).toBeLessThanOrEqual(Date.now() - REMINDER_CONFIG.reconciliation.stalledSendingAfterMs);
        expect(take).toBe(50);
    });

    it.each(['waiting', 'delayed', 'active', 'paused', 'stuck'])('leaves a classic SENDING row alone while its job is %s', async (state) => {
        // Arrange
        const { service, repository } = createReconciliation({ stalledClassic: [{ id: 'c1', attempt: 0 }], job: fakeJob(state) });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).not.toHaveBeenCalled();
    });

    it.each(['failed', 'completed'])('retries a classic SENDING row whose job is %s', async (state) => {
        // Arrange
        const { service, repository } = createReconciliation({ stalledClassic: [{ id: 'c1', attempt: 0 }], job: fakeJob(state) });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).toHaveBeenCalledTimes(1);
    });

    it('makes the retry terminal when it reaches the maximum attempts', async () => {
        // Arrange
        const { service, repository } = createReconciliation({ stalledClassic: [{ id: 'c1', attempt: REMINDER_CONFIG.retry.maxAttempts - 1 }] });

        // Act
        await service.tick();

        // Assert
        expect(repository.recordFailedAttempt).toHaveBeenCalledWith(
            'c1',
            ReminderScheduleStatus.SENDING,
            expect.objectContaining({ terminal: true, nextAttempt: REMINDER_CONFIG.retry.maxAttempts }),
            'stuck_sending',
            expect.any(String),
        );
    });
});
