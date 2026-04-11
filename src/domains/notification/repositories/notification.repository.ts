import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Notification, NotificationRecipient, Prisma } from '@prisma/client';
import { NotificationInput } from '../dto';

const notificationInclude = {
    notificationRecipients: {
        include: {
            user: true,
        },
    },
} satisfies Prisma.NotificationInclude;

export type NotificationWithRecipients = Prisma.NotificationGetPayload<{
    include: typeof notificationInclude;
}>;

@Injectable()
export class NotificationRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findAllWithRecipients(): Promise<NotificationWithRecipients[]> {
        return this.prisma.notification.findMany({
            include: notificationInclude,
            orderBy: { createdAt: 'desc' },
        });
    }

    public async findManyForUser(userId: string, includeDeleted: boolean, isRead?: boolean): Promise<NotificationWithRecipients[]> {
        return this.prisma.notification.findMany({
            where: {
                isActive: true,
                expiresAt: { gt: new Date() },
                notificationRecipients: {
                    some: {
                        userId,
                        isDeleted: includeDeleted ? undefined : false,
                        ...(isRead !== undefined && { isRead }),
                    },
                },
            },
            include: {
                notificationRecipients: {
                    where: {
                        userId,
                        ...(isRead !== undefined && { isRead }),
                    },
                    include: {
                        user: true,
                    },
                },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
    }

    public async findByIdWithRecipients(id: string): Promise<NotificationWithRecipients | null> {
        return this.prisma.notification.findUnique({
            where: { id },
            include: notificationInclude,
        });
    }

    public async findById(id: string): Promise<Notification | null> {
        return this.prisma.notification.findUnique({ where: { id } });
    }

    public async createWithRecipients(input: NotificationInput): Promise<NotificationWithRecipients> {
        const { type, action, priority, data, isActive = true, expiresAt, recipientUserIds } = input;

        return this.prisma.notification.create({
            data: {
                type,
                action,
                priority,
                data,
                isActive,
                expiresAt,
                notificationRecipients: {
                    create: recipientUserIds.map((userId) => ({ userId })),
                },
            },
            include: notificationInclude,
        });
    }

    public async updateById(id: string, data: Prisma.NotificationUpdateInput): Promise<NotificationWithRecipients> {
        return this.prisma.notification.update({
            where: { id },
            data,
            include: notificationInclude,
        });
    }

    public async findRecipient(notificationId: string, userId: string): Promise<NotificationRecipient | null> {
        return this.prisma.notificationRecipient.findUnique({
            where: {
                notificationId_userId: { notificationId, userId },
            },
        });
    }

    public async updateRecipient(notificationId: string, userId: string, data: Prisma.NotificationRecipientUpdateInput): Promise<NotificationRecipient> {
        return this.prisma.notificationRecipient.update({
            where: { notificationId_userId: { notificationId, userId } },
            data,
        });
    }

    public async markAllAsReadForUser(userId: string): Promise<number> {
        const result = await this.prisma.notificationRecipient.updateMany({
            where: {
                userId,
                isRead: false,
                isDeleted: false,
            },
            data: { isRead: true },
        });
        return result.count;
    }

    public async countUnreadForUser(userId: string): Promise<number> {
        return this.prisma.notificationRecipient.count({
            where: {
                userId,
                isRead: false,
                isDeleted: false,
                notification: {
                    isActive: true,
                    expiresAt: { gt: new Date() },
                },
            },
        });
    }

    public async deleteById(id: string): Promise<NotificationWithRecipients> {
        return this.prisma.notification.delete({
            where: { id },
            include: notificationInclude,
        });
    }

    public async deleteManyExpired(): Promise<number> {
        const result = await this.prisma.notification.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
        return result.count;
    }
}
