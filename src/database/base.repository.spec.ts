import { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

class TestRepository extends BaseRepository {
    public constructor(prisma: unknown) {
        super(prisma as never);
    }
}

const writeConflict = () =>
    new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock. Please retry your transaction', {
        code: 'P2034',
        clientVersion: '6.11.1',
    });

const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`dedupe_key`)', { code: 'P2002', clientVersion: '6.11.1' });

/** SELECT ... FOR UPDATE is a raw query. Prisma reports its Postgres error as P2010, with the Postgres code in meta. */
const rawQueryError = (pgCode: string) =>
    new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`${pgCode}\`. Message: \`pg error\``, {
        code: 'P2010',
        clientVersion: '6.11.1',
        meta: { code: pgCode, message: 'pg error' },
    });

describe('BaseRepository.runSerializableWithRetry', () => {
    const build = () => {
        const tx = {};
        const prisma = { $transaction: jest.fn(async (fn: (client: object) => Promise<unknown>) => fn(tx)) };

        return { repo: new TestRepository(prisma), prisma };
    };

    test('retries a write conflict once, then returns the result of the second run, in serializable isolation', async () => {
        // Arrange
        const { repo, prisma } = build();
        const work = jest.fn().mockRejectedValueOnce(writeConflict()).mockResolvedValueOnce('applied');

        // Act
        const result = await repo.runSerializableWithRetry(work);

        // Assert
        expect(result).toBe('applied');
        expect(work).toHaveBeenCalledTimes(2);
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });

    test('does not retry a unique violation (P2002), and rethrows it', async () => {
        // Arrange
        const { repo } = build();
        const error = uniqueViolation();
        const work = jest.fn().mockRejectedValue(error);

        // Act and Assert
        await expect(repo.runSerializableWithRetry(work)).rejects.toBe(error);
        expect(work).toHaveBeenCalledTimes(1);
    });

    test('retries a serialization failure (40001) that a raw query raises as P2010, such as SELECT ... FOR UPDATE', async () => {
        // Arrange
        const { repo } = build();
        const work = jest.fn().mockRejectedValueOnce(rawQueryError('40001')).mockResolvedValueOnce('applied');

        // Act
        const result = await repo.runSerializableWithRetry(work);

        // Assert
        expect(result).toBe('applied');
        expect(work).toHaveBeenCalledTimes(2);
    });

    test('does not retry other raw query errors (P2010 with another Postgres code)', async () => {
        // Arrange
        const { repo } = build();
        const error = rawQueryError('42P01');
        const work = jest.fn().mockRejectedValue(error);

        // Act and Assert
        await expect(repo.runSerializableWithRetry(work)).rejects.toBe(error);
        expect(work).toHaveBeenCalledTimes(1);
    });

    test('stops after three attempts and throws the last write conflict', async () => {
        // Arrange
        const { repo } = build();
        const last = writeConflict();
        const work = jest.fn().mockRejectedValueOnce(writeConflict()).mockRejectedValueOnce(writeConflict()).mockRejectedValueOnce(last);

        // Act and Assert
        await expect(repo.runSerializableWithRetry(work)).rejects.toBe(last);
        expect(work).toHaveBeenCalledTimes(3);
    });
});
