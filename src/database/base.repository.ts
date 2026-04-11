import { PrismaService } from '@/shared/services/prisma.service';
import { Prisma } from '@prisma/client';

export abstract class BaseRepository {
    protected constructor(protected readonly prisma: PrismaService) {}

    public async inTransaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
        },
    ): Promise<T> {
        return this.runInTransaction(fn, options);
    }

    protected client(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
        return tx ?? this.prisma;
    }

    protected async runInTransaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
        },
    ): Promise<T> {
        return this.prisma.$transaction(fn, options);
    }
}
