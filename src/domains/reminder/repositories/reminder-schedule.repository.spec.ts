import { ReminderScheduleStatus } from '@prisma/client';
import { EEmailTemplate } from '../utils';
import { ReminderScheduleRepository } from './reminder-schedule.repository';

function createRepository(updateCount = 1) {
    const prisma = {
        reminderSchedule: {
            updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
            findMany: jest.fn().mockResolvedValue([]),
        },
    };

    return { repository: new ReminderScheduleRepository(prisma as never), prisma };
}

describe('ReminderScheduleRepository.recordFailedAttempt', () => {
    it('sends a retryable failure back to PENDING with the next attempt and time', async () => {
        // Arrange
        const { repository, prisma } = createRepository();
        const nextAttemptAt = new Date('2026-11-16T10:05:00.000Z');

        // Act
        const recorded = await repository.recordFailedAttempt('s1', ReminderScheduleStatus.QUEUED, { terminal: false, nextAttempt: 1, nextAttemptAt }, 'orphaned_queue', 'no job');

        // Assert
        expect(recorded).toBe(true);
        expect(prisma.reminderSchedule.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', status: ReminderScheduleStatus.QUEUED },
            data: expect.objectContaining({
                status: ReminderScheduleStatus.PENDING,
                attempt: 1,
                nextAttemptAt,
                lastErrorCode: 'orphaned_queue',
                lastErrorMsg: 'no job',
                lockedBy: null,
                lockedAt: null,
            }),
        });
    });

    it('marks the row FAILED_TERMINAL when the decision is terminal', async () => {
        // Arrange
        const { repository, prisma } = createRepository();

        // Act
        await repository.recordFailedAttempt('s1', ReminderScheduleStatus.SENDING, { terminal: true, nextAttempt: 3, nextAttemptAt: new Date() }, 'send_failed', 'boom');

        // Assert
        expect(prisma.reminderSchedule.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', status: ReminderScheduleStatus.SENDING },
            data: expect.objectContaining({
                status: ReminderScheduleStatus.FAILED_TERMINAL,
                attempt: 3,
                lastErrorCode: 'send_failed',
                lastErrorMsg: 'boom',
                completedAt: expect.any(Date),
            }),
        });
    });

    it('reports false when the row has already left the expected status', async () => {
        // Arrange
        const { repository } = createRepository(0);

        // Act
        const recorded = await repository.recordFailedAttempt(
            's1',
            ReminderScheduleStatus.QUEUED,
            { terminal: false, nextAttempt: 1, nextAttemptAt: new Date() },
            'orphaned_queue',
            'no job',
        );

        // Assert
        expect(recorded).toBe(false);
    });
});

describe('ReminderScheduleRepository: first-N queries are ordered', () => {
    it('finds QUEUED rows older than the cutoff, oldest first, with their attempt count', async () => {
        // Arrange
        const { repository, prisma } = createRepository();
        const olderThan = new Date('2026-11-16T09:58:00.000Z');

        // Act
        await repository.findQueuedOlderThan(olderThan, 50);

        // Assert
        expect(prisma.reminderSchedule.findMany).toHaveBeenCalledWith({
            where: { status: ReminderScheduleStatus.QUEUED, updatedAt: { lt: olderThan } },
            orderBy: { updatedAt: 'asc' },
            take: 50,
            select: { id: true, attempt: true },
        });
    });

    it('finds stuck FSRS rows in SENDING, oldest first', async () => {
        // Arrange
        const { repository, prisma } = createRepository();
        const olderThan = new Date('2026-11-16T09:55:00.000Z');

        // Act
        await repository.findStalledFsrsSending(olderThan, 50);

        // Assert
        expect(prisma.reminderSchedule.findMany).toHaveBeenCalledWith({
            where: { status: ReminderScheduleStatus.SENDING, updatedAt: { lt: olderThan }, template: EEmailTemplate.FSRS_DUE_REMINDER },
            orderBy: { updatedAt: 'asc' },
            take: 50,
            select: { id: true, template: true },
        });
    });

    it('finds classic rows stuck in SENDING, oldest first, skipping FSRS rows', async () => {
        // Arrange
        const { repository, prisma } = createRepository();
        const olderThan = new Date('2026-11-16T09:55:00.000Z');

        // Act
        await repository.findStalledClassicSending(olderThan, 50);

        // Assert
        expect(prisma.reminderSchedule.findMany).toHaveBeenCalledWith({
            where: { status: ReminderScheduleStatus.SENDING, updatedAt: { lt: olderThan }, template: { not: EEmailTemplate.FSRS_DUE_REMINDER } },
            orderBy: { updatedAt: 'asc' },
            take: 50,
            select: { id: true, attempt: true },
        });
    });

    it('finds initial reminders oldest first', async () => {
        // Arrange
        const { repository, prisma } = createRepository();

        // Act
        await repository.findInitialSentRemindersBefore(new Date('2026-11-16T09:00:00.000Z'), 20);

        // Assert
        expect(prisma.reminderSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { sentAt: 'asc' }, take: 20 }));
    });
});
