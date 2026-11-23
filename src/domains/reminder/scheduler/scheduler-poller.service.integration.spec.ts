import redisConfig from '@/config/redis.config';
import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import { EmailReminderProducer } from '@/queues/producers/email-reminder.producer';
import { PrismaService } from '@/shared/services/prisma.service';
import { ReminderSchedule, ReminderScheduleStatus } from '@prisma/client';
import Bull from 'bull';
import { randomUUID } from 'crypto';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { EEmailTemplate, EReminderType } from '../utils';
import { SchedulerPollerService } from './scheduler-poller.service';

// Runs against a real Postgres and a real Redis:
//   FSRS_TEST_DATABASE_URL=<local test DB URL, same as reminder-schedule.repository.integration.spec.ts> pnpm test scheduler-poller.service.integration
// Redis is the URL the app uses (src/config/redis.config.ts). Each test gets its own Bull prefix and removes its keys, so dev queues are not touched.
// claimDueBatch is stubbed: the real claim takes every due PENDING row in the shared test DB, including rows other specs own.
// A failed Bull add is simulated at the producer. The tests do not stop Redis.
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const { url: redisUrl } = redisConfig();

const RECIPIENT_PREFIX = 'poller-spec';
const SPEC_OWNER = 'poller-spec';
const QUEUE_NAME = EReminderType.EMAIL_REMINDER;
const QUEUE_DEFAULTS = QUEUE_CONFIG[QUEUE_NAME].defaultJobOptions;
// Same job id the producer uses for schedule jobs.
const scheduleJobId = (scheduleId: string): string => `reminder-schedule-${scheduleId}`;

describeWithDb('SchedulerPollerService (real Postgres and Bull)', () => {
    let prisma: PrismaService;
    let prefix: string;
    let queue: Bull.Queue;
    let worker: Bull.Queue | undefined;
    let repository: ReminderScheduleRepository;
    let producer: EmailReminderProducer;
    let poller: SchedulerPollerService;
    let logger: { error: jest.Mock; info: jest.Mock; warn: jest.Mock };
    let savedPollerFlag: string | undefined;

    // A row as claimDueBatch leaves it: CLAIMED and locked by this spec.
    const createClaimedRow = async (): Promise<ReminderSchedule> =>
        prisma.reminderSchedule.create({
            data: {
                dedupeKey: `${RECIPIENT_PREFIX}:${randomUUID()}`,
                template: EEmailTemplate.EXAM_REMINDER,
                recipient: `${RECIPIENT_PREFIX}-${randomUUID()}@example.com`,
                dueAt: new Date(),
                status: ReminderScheduleStatus.CLAIMED,
                attempt: 0,
                lockedBy: SPEC_OWNER,
                lockedAt: new Date(),
            },
        });

    const readRow = async (id: string): Promise<ReminderSchedule> => prisma.reminderSchedule.findUniqueOrThrow({ where: { id } });

    const setStatus = async (id: string, status: ReminderScheduleStatus): Promise<void> => {
        await prisma.reminderSchedule.update({ where: { id }, data: { status } });
    };

    // Returns only this spec's rows. The real repository writes (QUEUED mark, revert to PENDING) still run.
    const claimReturns = (rows: ReminderSchedule[]): void => {
        jest.spyOn(repository, 'claimDueBatch').mockResolvedValue(rows);
    };

    // Runs one job on a separate worker until it fails. The failed job stays in Redis, as it does in the app.
    const failJobOnce = async (): Promise<void> => {
        const failingWorker = new Bull(QUEUE_NAME, redisUrl, { prefix, defaultJobOptions: QUEUE_DEFAULTS });
        worker = failingWorker;
        const failed = new Promise<void>((resolve) => {
            failingWorker.once('failed', () => resolve());
        });
        void failingWorker.process(() => {
            throw new Error('send failed');
        });
        await failed;
        await failingWorker.close();
        worker = undefined;
    };

    const cleanup = async (): Promise<void> => {
        await prisma.reminderSchedule.deleteMany({ where: { recipient: { startsWith: RECIPIENT_PREFIX } } });
    };

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        // The repo's .env sets REMINDER_POLLER_ENABLED=false, and tick() does nothing unless this is on.
        savedPollerFlag = process.env.REMINDER_POLLER_ENABLED;
        process.env.REMINDER_POLLER_ENABLED = 'true';

        prefix = `poller-spec-${randomUUID()}`;
        queue = new Bull(QUEUE_NAME, redisUrl, { prefix, defaultJobOptions: QUEUE_DEFAULTS });
        repository = new ReminderScheduleRepository(prisma);
        producer = new EmailReminderProducer(queue);
        logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
        poller = new SchedulerPollerService(producer, repository, logger as never);
        await cleanup();
    });

    afterEach(async () => {
        if (worker) {
            await worker.close();
            worker = undefined;
        }
        await queue.obliterate({ force: true });
        await queue.close();
        await cleanup();

        if (savedPollerFlag === undefined) {
            delete process.env.REMINDER_POLLER_ENABLED;
        } else {
            process.env.REMINDER_POLLER_ENABLED = savedPollerFlag;
        }
    });

    test('marks a claimed row QUEUED and adds one waiting Bull job for it', async () => {
        // Arrange
        const row = await createClaimedRow();
        claimReturns([row]);

        // Act
        await poller.tick();

        // Assert
        expect(await readRow(row.id)).toMatchObject({ status: ReminderScheduleStatus.QUEUED, lockedBy: null, lockedAt: null });
        const job = await queue.getJob(scheduleJobId(row.id));
        expect(job).not.toBeNull();
        expect(job?.data).toEqual({ scheduleId: row.id });
        expect(await job?.getState()).toBe('waiting');
        expect(job?.opts).toMatchObject({ attempts: 1, removeOnComplete: true });
    });

    test('adds no Bull job when the row was cancelled between the claim and the QUEUED mark', async () => {
        // Arrange
        const row = await createClaimedRow();
        await setStatus(row.id, ReminderScheduleStatus.CANCELLED);
        claimReturns([row]);

        // Act
        await poller.tick();

        // Assert
        expect(await readRow(row.id)).toMatchObject({ status: ReminderScheduleStatus.CANCELLED });
        expect(await queue.getWaitingCount()).toBe(0);
        expect(await queue.getJob(scheduleJobId(row.id))).toBeNull();
    });

    test('puts the row back to PENDING when Bull rejects the add, and logs the failure', async () => {
        // Arrange
        const row = await createClaimedRow();
        claimReturns([row]);
        jest.spyOn(producer, 'enqueueScheduleJobWithReturnJob').mockRejectedValueOnce(new Error('redis unavailable'));

        // Act
        await poller.tick();

        // Assert
        expect(await readRow(row.id)).toMatchObject({ status: ReminderScheduleStatus.PENDING, attempt: 0, lockedBy: null, lockedAt: null });
        expect(await queue.getJob(scheduleJobId(row.id))).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('redis unavailable'));
    });

    test('keeps the one waiting job when the same row is claimed again', async () => {
        // Arrange
        const row = await createClaimedRow();
        claimReturns([row]);
        await poller.tick();
        const firstJob = await queue.getJob(scheduleJobId(row.id));
        await setStatus(row.id, ReminderScheduleStatus.CLAIMED);

        // Act
        await poller.tick();

        // Assert
        expect(await readRow(row.id)).toMatchObject({ status: ReminderScheduleStatus.QUEUED });
        expect(await queue.getWaitingCount()).toBe(1);
        expect((await queue.getJob(scheduleJobId(row.id)))?.timestamp).toBe(firstJob?.timestamp);
    });

    test('replaces a failed job with the same id, so the row is queued again', async () => {
        // Arrange
        const row = await createClaimedRow();
        claimReturns([row]);
        await poller.tick();
        await failJobOnce();
        expect(await (await queue.getJob(scheduleJobId(row.id)))?.getState()).toBe('failed');
        await setStatus(row.id, ReminderScheduleStatus.CLAIMED);

        // Act
        await poller.tick();

        // Assert
        expect(await readRow(row.id)).toMatchObject({ status: ReminderScheduleStatus.QUEUED });
        const job = await queue.getJob(scheduleJobId(row.id));
        expect(await job?.getState()).toBe('waiting');
        expect(job?.failedReason).toBeUndefined();
        expect(await queue.getFailedCount()).toBe(0);
    });
});
