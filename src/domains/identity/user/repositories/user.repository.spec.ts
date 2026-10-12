import type { PrismaService } from '@/shared';
import { Prisma, UserRole } from '@prisma/client';
import { UserRepository, UserTransaction } from './user.repository';

const TX = {} as UserTransaction;

const writeConflict = () => new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', { code: 'P2034', clientVersion: '6.11.1' });

const createRepository = () => {
    const prisma = {
        user: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
    };
    const repository = new UserRepository(prisma as unknown as PrismaService);
    return { repository, prisma };
};

describe('UserRepository.findPage', () => {
    it('applies search, role and status, sorts by email and pages in the database', async () => {
        const { repository, prisma } = createRepository();

        await repository.findPage({ search: 'gmail', role: UserRole.MEMBER, isActive: false, sortBy: 'email', sortOrder: 'asc', skip: 5, take: 5 });

        const where = {
            OR: [
                { email: { contains: 'gmail', mode: 'insensitive' } },
                { firstName: { contains: 'gmail', mode: 'insensitive' } },
                { lastName: { contains: 'gmail', mode: 'insensitive' } },
            ],
            role: UserRole.MEMBER,
            isActive: false,
        };
        expect(prisma.user.findMany).toHaveBeenCalledWith({ where, orderBy: { email: 'asc' }, skip: 5, take: 5 });
        expect(prisma.user.count).toHaveBeenCalledWith({ where });
    });

    it('uses an empty where and newest-first order with no filter', async () => {
        const { repository, prisma } = createRepository();

        await repository.findPage({ sortBy: 'createdAt', sortOrder: 'desc', skip: 0, take: 10 });

        expect(prisma.user.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { createdAt: 'desc' }, skip: 0, take: 10 });
    });
});

describe('UserRepository.runSerializableWithRetry', () => {
    it('retries a write conflict and returns the result of the third attempt', async () => {
        const { repository } = createRepository();
        const inTransaction = jest
            .spyOn(repository, 'inTransaction')
            .mockRejectedValueOnce(writeConflict())
            .mockRejectedValueOnce(writeConflict())
            .mockResolvedValueOnce('committed');

        await expect(repository.runSerializableWithRetry(async () => Promise.resolve('unused'))).resolves.toBe('committed');
        expect(inTransaction).toHaveBeenCalledTimes(3);
        expect(inTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });

    it('gives up after three write conflicts and rethrows the last one', async () => {
        const { repository } = createRepository();
        const conflict = writeConflict();
        const inTransaction = jest.spyOn(repository, 'inTransaction').mockRejectedValue(conflict);

        await expect(repository.runSerializableWithRetry(async () => Promise.resolve('unused'))).rejects.toBe(conflict);
        expect(inTransaction).toHaveBeenCalledTimes(3);
    });

    it('does not retry errors that are not write conflicts', async () => {
        const { repository } = createRepository();
        const inTransaction = jest.spyOn(repository, 'inTransaction').mockRejectedValue(new Error('connection lost'));

        await expect(repository.runSerializableWithRetry(async () => Promise.resolve('unused'))).rejects.toThrow('connection lost');
        expect(inTransaction).toHaveBeenCalledTimes(1);
    });

    it('hands the callback the transaction client', async () => {
        const { repository } = createRepository();
        jest.spyOn(repository, 'inTransaction').mockImplementation(async (fn) => fn(TX));

        const seen = await repository.runSerializableWithRetry(async (tx) => Promise.resolve(tx));

        expect(seen).toBe(TX);
    });
});
