import { ReminderScheduleStatus } from '@prisma/client';
import { SchedulerPollerService } from './scheduler-poller.service';

interface FakeJob {
    getState: jest.Mock;
    remove: jest.Mock;
}

function fakeJob(state: string): FakeJob {
    return { getState: jest.fn().mockResolvedValue(state), remove: jest.fn().mockResolvedValue(undefined) };
}

function createPoller(options: { rows?: Array<{ id: string }>; markOk?: boolean; existingJob?: FakeJob; enqueueError?: Error } = {}) {
    const producer = {
        getReminderScheduleJob: jest.fn().mockResolvedValue(options.existingJob),
        enqueueScheduleJobWithReturnJob: options.enqueueError ? jest.fn().mockRejectedValue(options.enqueueError) : jest.fn().mockResolvedValue({ remove: jest.fn() }),
    };
    const repository = {
        claimDueBatch: jest.fn().mockResolvedValue(options.rows ?? [{ id: 's1' }]),
        transitionStatus: jest.fn().mockResolvedValue(options.markOk ?? true),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const poller = new SchedulerPollerService(producer as never, repository as never, logger as never);

    return { poller, producer, repository };
}

// The repo's .env sets REMINDER_POLLER_ENABLED=false, and jest loads .env, so tick() would do nothing. Enable it for these tests.
let savedPollerFlag: string | undefined;

beforeEach(() => {
    savedPollerFlag = process.env.REMINDER_POLLER_ENABLED;
    process.env.REMINDER_POLLER_ENABLED = 'true';
});

afterEach(() => {
    if (savedPollerFlag === undefined) {
        delete process.env.REMINDER_POLLER_ENABLED;
    } else {
        process.env.REMINDER_POLLER_ENABLED = savedPollerFlag;
    }
});

describe('SchedulerPollerService.tick: QUEUED mark and job add', () => {
    it('marks the row QUEUED before it adds the Bull job', async () => {
        // Arrange
        const { poller, producer, repository } = createPoller();

        // Act
        await poller.tick();

        // Assert
        expect(repository.transitionStatus).toHaveBeenCalledWith('s1', ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.QUEUED, {
            lockedBy: null,
            lockedAt: null,
        });
        const markOrder = repository.transitionStatus.mock.invocationCallOrder[0] ?? 0;
        const addOrder = producer.enqueueScheduleJobWithReturnJob.mock.invocationCallOrder[0] ?? 0;
        expect(markOrder).toBeLessThan(addOrder);
    });

    it('adds no job when the QUEUED mark fails', async () => {
        // Arrange
        const { poller, producer } = createPoller({ markOk: false });

        // Act
        await poller.tick();

        // Assert
        expect(producer.enqueueScheduleJobWithReturnJob).not.toHaveBeenCalled();
    });

    it('reverts the row to PENDING when adding the job fails', async () => {
        // Arrange
        const { poller, repository } = createPoller({ enqueueError: new Error('redis unavailable') });

        // Act
        await poller.tick();

        // Assert
        expect(repository.transitionStatus).toHaveBeenLastCalledWith('s1', ReminderScheduleStatus.QUEUED, ReminderScheduleStatus.PENDING, {
            lockedBy: null,
            lockedAt: null,
        });
    });

    it('goes on with the next row when one row fails', async () => {
        // Arrange: the first mark throws; the second row must still be enqueued.
        const { poller, producer, repository } = createPoller({ rows: [{ id: 's1' }, { id: 's2' }] });
        repository.transitionStatus.mockRejectedValueOnce(new Error('db timeout')).mockResolvedValue(true);

        // Act
        await poller.tick();

        // Assert
        expect(producer.enqueueScheduleJobWithReturnJob).toHaveBeenCalledTimes(1);
        expect(producer.enqueueScheduleJobWithReturnJob).toHaveBeenCalledWith({ scheduleId: 's2' }, expect.objectContaining({ jobId: 'reminder-schedule-s2' }));
    });
});

describe('SchedulerPollerService.tick: job with the same id', () => {
    it.each(['failed', 'completed'])('removes a %s job with the same id before it adds the new one', async (state) => {
        // Arrange
        const finished = fakeJob(state);
        const { poller, producer } = createPoller({ existingJob: finished });

        // Act
        await poller.tick();

        // Assert
        expect(finished.remove).toHaveBeenCalledTimes(1);
        const removeOrder = finished.remove.mock.invocationCallOrder[0] ?? 0;
        const addOrder = producer.enqueueScheduleJobWithReturnJob.mock.invocationCallOrder[0] ?? 0;
        expect(removeOrder).toBeLessThan(addOrder);
    });

    it('keeps a waiting job with the same id', async () => {
        // Arrange
        const waiting = fakeJob('waiting');
        const { poller } = createPoller({ existingJob: waiting });

        // Act
        await poller.tick();

        // Assert
        expect(waiting.remove).not.toHaveBeenCalled();
    });
});
