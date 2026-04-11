import { Prisma } from '@prisma/client';
import { PrismaService } from '../modules/shared/services/prisma.service';

export abstract class BaseRepository {
    protected constructor(protected readonly prisma: PrismaService) {}

    protected client(tx?: Prisma.TransactionClient): PrismaService | Prisma.TransactionClient {
        return tx ?? this.prisma;
    }

    protected runInTransaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
        },
    ): Promise<T> {
        return this.prisma.$transaction(fn, options);
    }

    public inTransaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
        },
    ): Promise<T> {
        return this.runInTransaction(fn, options);
    }
}
