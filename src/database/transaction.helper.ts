import { Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/services/prisma.service';

export async function withTransaction<T>(
    prisma: PrismaService,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    },
): Promise<T> {
    return prisma.$transaction(fn, options);
}
