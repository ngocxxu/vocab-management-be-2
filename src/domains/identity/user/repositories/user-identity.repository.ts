import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';

@Injectable()
export class UserIdentityRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
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
