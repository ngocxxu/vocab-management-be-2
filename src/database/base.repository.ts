import { PrismaService } from '@/shared/services/prisma.service';
import { Prisma } from '@prisma/client';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const WRITE_CONFLICT_CODE = 'P2034';
/** A raw query (SELECT ... FOR UPDATE) reports its Postgres error as P2010, with the Postgres code in meta. */
const RAW_QUERY_ERROR_CODE = 'P2010';
const SERIALIZATION_FAILURE_PG_CODE = '40001';

const isWriteConflict = (error: unknown): boolean => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return false;
    }

    return error.code === WRITE_CONFLICT_CODE || (error.code === RAW_QUERY_ERROR_CODE && error.meta?.code === SERIALIZATION_FAILURE_PG_CODE);
};

export abstract class BaseRepository {
    protected constructor(protected readonly prisma: PrismaService) {}

    /**
     * Runs `fn` as a serializable transaction. A write conflict (P2034), or a serialization failure that a raw query
     * raises (P2010 with Postgres code 40001, as SELECT ... FOR UPDATE does), runs it again, up to three attempts
     * in total. Any other error, or the last conflict, is rethrown.
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
