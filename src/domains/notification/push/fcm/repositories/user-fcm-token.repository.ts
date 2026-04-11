import { Injectable } from '@nestjs/common';
import { Prisma, UserFcmToken } from '@prisma/client';
import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';

@Injectable()
export class UserFcmTokenRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findByUserAndToken(
        userId: string,
        fcmToken: string,
    ): Promise<UserFcmToken | null> {
        return this.prisma.userFcmToken.findUnique({
            where: {
                userId_fcmToken: { userId, fcmToken },
            },
        });
    }

    public async updateByUserAndToken(
        userId: string,
        fcmToken: string,
        data: Prisma.UserFcmTokenUpdateInput,
    ): Promise<UserFcmToken> {
        return this.prisma.userFcmToken.update({
            where: { userId_fcmToken: { userId, fcmToken } },
            data,
        });
    }

    public async create(data: Prisma.UserFcmTokenUncheckedCreateInput): Promise<UserFcmToken> {
        return this.prisma.userFcmToken.create({ data });
    }

    public async findManyActiveByUserId(userId: string): Promise<UserFcmToken[]> {
        return this.prisma.userFcmToken.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    public async findManyActiveByUserIds(userIds: string[]): Promise<UserFcmToken[]> {
        return this.prisma.userFcmToken.findMany({
            where: {
                userId: { in: userIds },
                isActive: true,
            },
        });
    }
}
