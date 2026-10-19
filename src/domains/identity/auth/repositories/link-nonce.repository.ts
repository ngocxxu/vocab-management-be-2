import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class LinkNonceRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async create(userId: string, nonce: string, expiresAt: Date, tx?: Prisma.TransactionClient): Promise<void> {
        await this.client(tx).linkNonce.create({ data: { userId, nonce, expiresAt } });
    }

    /**
     * Uses the nonce in one conditional update: it must exist, belong to `userId`, be unused and not expired.
     * Returns false when any of that fails, so a nonce can be spent exactly once even under concurrent requests.
     */
    public async consume(nonce: string, userId: string, now: Date, tx?: Prisma.TransactionClient): Promise<boolean> {
        const { count } = await this.client(tx).linkNonce.updateMany({
            where: { nonce, userId, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
        });
        return count === 1;
    }
}
