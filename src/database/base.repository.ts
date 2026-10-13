import { PrismaService } from '@/shared/services/prisma.service';
import { Prisma } from '@prisma/client';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const WRITE_CONFLICT_CODE = 'P2034';

const isWriteConflict = (error: unknown): boolean => error instanceof Prisma.PrismaClientKnownRequestError && error.code === WRITE_CONFLICT_CODE;

export abstract class BaseRepository {
    protected constructor(protected readonly prisma: PrismaService) {}

    /**
     * Runs `fn` as a serializable transaction. A write conflict (P2034) runs it again,
     * up to three attempts in total. Any other error, or the last conflict, is rethrown.
     */
    public async runSerializableWithRetry<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        for (let attempt = 1; ; attempt += 1) {
            try {
                return await this.inTransaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
            } catch (error) {
                if (!isWriteConflict(error) || attempt >= MAX_SERIALIZABLE_ATTEMPTS) {
                    throw error;
                }
            }
        }
    }

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
