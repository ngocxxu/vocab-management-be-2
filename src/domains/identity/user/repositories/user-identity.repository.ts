import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UserIdentityRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    /** Every Identity of a User. Read before deleting the User: the rows cascade away with it. */
    public async findByUserId(userId: string, tx?: Prisma.TransactionClient): Promise<{ issuer: string; subject: string }[]> {
        return this.client(tx).userIdentity.findMany({ where: { userId }, select: { issuer: true, subject: true } });
    }

    /** Attach an Identity to an existing User. Throws the unique violation (P2002) when that issuer + subject is already mapped. */
    public async link(userId: string, issuer: string, subject: string, tx?: Prisma.TransactionClient): Promise<void> {
        await this.client(tx).userIdentity.create({ data: { userId, issuer, subject } });
    }

    /** The internal User an external login identity (token issuer + subject) is mapped to, or null. */
    public async findUserByIdentity(issuer: string, subject: string): Promise<User | null> {
        const identity = await this.prisma.userIdentity.findUnique({
            where: { issuer_subject: { issuer, subject } },
            include: { user: true },
        });
        return identity?.user ?? null;
    }
}
