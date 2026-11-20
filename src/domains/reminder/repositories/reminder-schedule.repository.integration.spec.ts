import { PrismaService } from '@/shared/services/prisma.service';
import { ReminderScheduleStatus } from '@prisma/client';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { EEmailTemplate } from '../utils';
import { decideReminderRetry } from '../utils/reminder-retry.util';
import { ReminderScheduleRepository } from './reminder-schedule.repository';

// Runs against a real Postgres:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test reminder-schedule.repository.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const SPEC_RECIPIENT_PREFIX = 'reminder-repo-spec';
const NOW = new Date('2026-11-16T10:00:00.000Z');
const QUEUED_CUTOFF = new Date(NOW.getTime() - REMINDER_CONFIG.reconciliation.orphanedQueuedAfterMs);
const STUCK_SENDING_CUTOFF = new Date(NOW.getTime() - REMINDER_CONFIG.reconciliation.stalledSendingAfterMs);
const MINUTE_MS = 60 * 1000;
const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * MINUTE_MS);

describeWithDb('ReminderScheduleRepository (real Postgres)', () => {
    let prisma: PrismaService;
    let repository: ReminderScheduleRepository;
    let seq = 0;

    // Creates a row, then sets updatedAt. The stuck-row queries filter on updatedAt.
    const createRow = async (options: { status: ReminderScheduleStatus; updatedAt: Date; template?: string; attempt?: number }) => {
        seq += 1;
        const created = await prisma.reminderSchedule.create({
            data: {
                dedupeKey: `${SPEC_RECIPIENT_PREFIX}:${seq}:${Date.now()}`,
                template: options.template ?? EEmailTemplate.FSRS_DUE_REMINDER,
                recipient: `${SPEC_RECIPIENT_PREFIX}-${seq}@example.com`,
                dueAt: NOW,
                status: options.status,
                attempt: options.attempt ?? 0,
            },
        });
        // updatedAt is @updatedAt. An explicit value replaces the automatic one.
        return prisma.reminderSchedule.update({ where: { id: created.id }, data: { updatedAt: options.updatedAt } });
    };

    const cleanup = async (): Promise<void> => {
        await prisma.reminderSchedule.deleteMany({ where: { recipient: { startsWith: SPEC_RECIPIENT_PREFIX } } });
    };

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        repository = new ReminderScheduleRepository(prisma);
        await prisma.$connect();
    });

    afterAll(async () => {
        await cleanup();
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await cleanup();
    });

    describe('findQueuedOlderThan', () => {
        test('returns QUEUED rows older than the cutoff, oldest first, with their attempt count', async () => {
            // Arrange
            const oldest = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(9), attempt: 0 });
            const older = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(5), attempt: 1 });
            const tooNew = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(1) });
            const wrongStatus = await createRow({ status: ReminderScheduleStatus.PENDING, updatedAt: minutesAgo(9) });
            const ourIds = [oldest.id, older.id, tooNew.id, wrongStatus.id];

            // Act
            const found = await repository.findQueuedOlderThan(QUEUED_CUTOFF, 500);

            // Assert: the shared test DB may hold other rows, so keep only ours.
            expect(found.filter((row) => ourIds.includes(row.id))).toEqual([
                { id: oldest.id, attempt: 0 },
                { id: older.id, attempt: 1 },
            ]);
        });
    });

    describe('findStalledFsrsSending', () => {
        test('returns only FSRS rows stuck in SENDING past the cutoff', async () => {
            // Arrange
            const stuckFsrs = await createRow({ status: ReminderScheduleStatus.SENDING, updatedAt: minutesAgo(10) });
            const freshFsrs = await createRow({ status: ReminderScheduleStatus.SENDING, updatedAt: minutesAgo(1) });
            const stuckClassic = await createRow({ status: ReminderScheduleStatus.SENDING, updatedAt: minutesAgo(10), template: EEmailTemplate.EXAM_REMINDER });
            const queuedFsrs = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(10) });
            const ourIds = [stuckFsrs.id, freshFsrs.id, stuckClassic.id, queuedFsrs.id];

            // Act
            const found = await repository.findStalledFsrsSending(STUCK_SENDING_CUTOFF, 500);

            // Assert
            expect(found.filter((row) => ourIds.includes(row.id))).toEqual([{ id: stuckFsrs.id, template: EEmailTemplate.FSRS_DUE_REMINDER }]);
        });
    });

    describe('findStalledClassicSending', () => {
        test('returns only classic rows stuck in SENDING past the cutoff', async () => {
            // Arrange
            const stuckClassic = await createRow({ status: ReminderScheduleStatus.SENDING, updatedAt: minutesAgo(10), template: EEmailTemplate.EXAM_REMINDER });
            const freshClassic = await createRow({ status: ReminderScheduleStatus.SENDING, updatedAt: minutesAgo(1), template: EEmailTemplate.EXAM_REMINDER });
            const stuckFsrs = await createRow({ status: ReminderScheduleStatus.SENDING, updatedAt: minutesAgo(10) });
            const queuedClassic = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(10), template: EEmailTemplate.EXAM_REMINDER });
            const ourIds = [stuckClassic.id, freshClassic.id, stuckFsrs.id, queuedClassic.id];

            // Act
            const found = await repository.findStalledClassicSending(STUCK_SENDING_CUTOFF, 500);

            // Assert
            expect(found.filter((row) => ourIds.includes(row.id))).toEqual([{ id: stuckClassic.id, attempt: 0 }]);
        });
    });

    describe('recordFailedAttempt', () => {
        test('sends a retryable failure back to PENDING with the next attempt, time and error', async () => {
            // Arrange
            const row = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(5), attempt: 0 });
            const decision = decideReminderRetry(0, NOW);

            // Act
            const recorded = await repository.recordFailedAttempt(row.id, ReminderScheduleStatus.QUEUED, decision, 'orphaned_queue', 'Queued without a live job');

            // Assert
            expect(recorded).toBe(true);
            const after = await prisma.reminderSchedule.findUniqueOrThrow({ where: { id: row.id } });
            expect(after).toMatchObject({
                status: ReminderScheduleStatus.PENDING,
                attempt: 1,
                lastErrorCode: 'orphaned_queue',
                lastErrorMsg: 'Queued without a live job',
                lockedBy: null,
                lockedAt: null,
            });
            expect(after.nextAttemptAt?.toISOString()).toBe(decision.nextAttemptAt.toISOString());
        });

        test('marks the row FAILED_TERMINAL on the third failed attempt, with the attempt count', async () => {
            // Arrange
            const row = await createRow({ status: ReminderScheduleStatus.QUEUED, updatedAt: minutesAgo(5), attempt: 2 });
            const decision = decideReminderRetry(2, NOW);

            // Act
            const recorded = await repository.recordFailedAttempt(row.id, ReminderScheduleStatus.QUEUED, decision, 'orphaned_queue', 'Queued without a live job');

            // Assert
            expect(recorded).toBe(true);
            const after = await prisma.reminderSchedule.findUniqueOrThrow({ where: { id: row.id } });
            expect(after).toMatchObject({ status: ReminderScheduleStatus.FAILED_TERMINAL, attempt: 3, lastErrorCode: 'orphaned_queue' });
            expect(after.completedAt).not.toBeNull();
        });

        test('does nothing when the row has already left the expected status', async () => {
            // Arrange
            const row = await createRow({ status: ReminderScheduleStatus.SENT, updatedAt: minutesAgo(5) });

            // Act
            const recorded = await repository.recordFailedAttempt(
                row.id,
                ReminderScheduleStatus.QUEUED,
                decideReminderRetry(0, NOW),
                'orphaned_queue',
                'Queued without a live job',
            );

            // Assert
            expect(recorded).toBe(false);
            const after = await prisma.reminderSchedule.findUniqueOrThrow({ where: { id: row.id } });
            expect(after).toMatchObject({ status: ReminderScheduleStatus.SENT, attempt: 0 });
        });
    });
});
