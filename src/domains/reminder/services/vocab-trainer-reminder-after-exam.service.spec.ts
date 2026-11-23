import { Prisma } from '@prisma/client';
import { VocabTrainerReminderAfterExamService } from './vocab-trainer-reminder-after-exam.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const INPUT = {
    trainerId: 't1',
    userId: 'u1',
    userEmail: 'learner@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    trainerName: 'Week 1',
    examUrl: 'https://app.example.com/exam',
    spacingDays: 2,
    reminderDisabled: false,
};

function createTx(options: { createManyError?: Error } = {}) {
    return {
        reminderSchedule: {
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue({ id: 'r1' }),
            createMany: options.createManyError ? jest.fn().mockRejectedValue(options.createManyError) : jest.fn().mockResolvedValue({ count: 1 }),
        },
    };
}

describe('VocabTrainerReminderAfterExamService.scheduleInitialTx', () => {
    test('writes the next reminder with skipDuplicates, so a clash is skipped inside the caller transaction', async () => {
        // Arrange
        const tx = createTx();
        const service = new VocabTrainerReminderAfterExamService();

        // Act
        await service.scheduleInitialTx(tx as never, INPUT);

        // Assert
        expect(tx.reminderSchedule.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
        expect(tx.reminderSchedule.create).not.toHaveBeenCalled();
    });

    test('a write conflict (P2034) is not swallowed: the caller sees the error and the transaction fails', async () => {
        // Arrange: a P2034 aborts the transaction, so returning quietly would let the commit roll back the whole attempt
        const writeConflict = new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock', {
            code: 'P2034',
            clientVersion: '6.11.1',
        });
        const tx = createTx({ createManyError: writeConflict });
        const service = new VocabTrainerReminderAfterExamService();

        // Act + Assert
        await expect(service.scheduleInitialTx(tx as never, INPUT)).rejects.toBe(writeConflict);
    });

    test('nothing is planned once the chain cap is reached', async () => {
        // Arrange
        const tx = createTx();
        tx.reminderSchedule.count.mockResolvedValue(30);
        const service = new VocabTrainerReminderAfterExamService();

        // Act
        await service.scheduleInitialTx(tx as never, INPUT);

        // Assert
        expect(tx.reminderSchedule.createMany).not.toHaveBeenCalled();
    });
});
