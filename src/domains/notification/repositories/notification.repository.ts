import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { chunk } from '@/shared/utils';
import { Injectable } from '@nestjs/common';
import { Notification, NotificationRecipient, NotificationType, Prisma, UserRole } from '@prisma/client';
import { NotificationInput, TBroadcastHistoryRow } from '../dto';

/** Recipient rows per insert. Keeps one statement well under the Postgres bind-parameter limit. */
const BROADCAST_CHUNK_SIZE = 500;

/** Prisma's interactive transactions default to 5 s, which a large audience can exceed mid-write. */
const BROADCAST_TRANSACTION_TIMEOUT_MS = 60_000;

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
            orderBy: { createdAt: 'desc' },
        });
    }

    public async findByIdWithRecipients(id: string): Promise<NotificationWithRecipients | null> {
        return this.prisma.notification.findUnique({
            where: { id },
            include: notificationInclude,
        });
    }

    /** Returns the notification only if `userId` is a recipient, with just that user's recipient row. */
    public async findByIdForRecipient(id: string, userId: string): Promise<NotificationWithRecipients | null> {
        return this.prisma.notification.findFirst({
            where: { id, notificationRecipients: { some: { userId } } },
            include: {
                notificationRecipients: {
                    where: { userId },
                    include: { user: true },
                },
            },
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

    /** Every SYSTEM notification, newest first, with its recipient count. Recipient rows are counted, not loaded. */
    public async findBroadcastHistoryRows(): Promise<TBroadcastHistoryRow[]> {
        return this.prisma.notification.findMany({
            where: { type: NotificationType.SYSTEM },
            select: {
                id: true,
                data: true,
                priority: true,
                isActive: true,
                expiresAt: true,
                createdAt: true,
                _count: { select: { notificationRecipients: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** IDs of active users, optionally limited to one role. Inactive users never receive a broadcast. */
    public async findActiveUserIds(role?: UserRole): Promise<string[]> {
        const users = await this.prisma.user.findMany({
            where: { isActive: true, ...(role !== undefined && { role }) },
            select: { id: true },
        });

        return users.map((user) => user.id);
    }

    /** The given IDs that belong to active users. Unknown and inactive IDs are dropped. */
    public async findActiveUserIdsIn(userIds: string[]): Promise<string[]> {
        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds }, isActive: true },
            select: { id: true },
        });

        return users.map((user) => user.id);
    }

    /** Writes the notification and its recipients in one transaction, recipients in chunks of BROADCAST_CHUNK_SIZE. */
    public async createBroadcast(data: Prisma.NotificationUncheckedCreateInput, recipientUserIds: string[]): Promise<Notification> {
        return this.inTransaction(
            async (tx) => {
                const notification = await tx.notification.create({ data });

                for (const userIds of chunk(recipientUserIds, BROADCAST_CHUNK_SIZE)) {
                    await tx.notificationRecipient.createMany({
                        data: userIds.map((userId) => ({ notificationId: notification.id, userId })),
                    });
                }

                return notification;
            },
            { timeout: BROADCAST_TRANSACTION_TIMEOUT_MS },
        );
    }

    public async deleteManyExpired(): Promise<number> {
        const result = await this.prisma.notification.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
        return result.count;
    }
}
