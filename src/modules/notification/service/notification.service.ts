import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { NotificationDto, NotificationInput, UpdateNotificationStatusInput } from '../model';

@Injectable()
export class NotificationService {
    // Custom error mapping cho Notification
    private readonly notificationErrorMapping = {
        P2002: 'Notification recipient assignment already exists',
        P2025: {
            update: 'Notification not found',
            delete: 'Notification not found',
            findOne: 'Notification not found',
            create: 'One or more users not found',
            find: 'Notification not found',
        },
        P2003: 'Invalid user ID provided',
    };

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all notifications in the database
     * @returns Promise<NotificationDto[]> Array of notification DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<NotificationDto[]> {
        try {
            const notifications = await this.prismaService.notification.findMany({
                include: {
                    notificationRecipients: {
                        include: {
                            user: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            return notifications.map((notification) => new NotificationDto(notification));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.notificationErrorMapping);
        }
    }

    /**
     * Find notifications for a specific user
     * @param userId - The user ID to get notifications for
     * @param includeDeleted - Whether to include deleted notifications
     * @returns Promise<NotificationDto[]> Array of notification DTOs
     */
    public async findByUser(
        userId: string,
        includeDeleted: boolean = false,
    ): Promise<NotificationDto[]> {
        try {
            const notifications = await this.prismaService.notification.findMany({
                where: {
                    isActive: true,
                    expiresAt: {
                        gt: new Date(),
                    },
                    notificationRecipients: {
                        some: {
                            userId,
                            isDeleted: includeDeleted ? undefined : false,
                        },
                    },
                },
                include: {
                    notificationRecipients: {
                        where: {
                            userId,
                        },
                        include: {
                            user: true,
                        },
                    },
                },
                orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            });

            return notifications.map((notification) => new NotificationDto(notification));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.notificationErrorMapping);
        }
    }

    /**
     * Find a single notification by ID
     * @param id - The notification ID to search for
     * @returns Promise<NotificationDto> The notification DTO
     * @throws NotFoundException when notification is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<NotificationDto> {
        try {
            const notification = await this.prismaService.notification.findUnique({
                where: { id },
                include: {
                    notificationRecipients: {
                        include: {
                            user: true,
                        },
                    },
                },
            });

            if (!notification) {
                throw new NotFoundException(`Notification with ID ${id} not found`);
            }

            return new NotificationDto(notification);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.notificationErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new notification with recipients
     * @param createNotificationData - The notification input data
     * @returns Promise<NotificationDto> The created notification DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(createNotificationData: NotificationInput): Promise<NotificationDto> {
        try {
            const {
                type,
                action,
                priority,
                data,
                isActive = true,
                expiresAt,
                recipientUserIds,
            }: NotificationInput = createNotificationData;

            const notification = await this.prismaService.notification.create({
                data: {
                    type,
                    action,
                    priority,
                    data,
                    isActive,
                    expiresAt,
                    notificationRecipients: {
                        create: recipientUserIds.map((userId) => ({
                            userId,
                            // notificationId will be generated by prisma
                        })),
                    },
                },
                include: {
                    notificationRecipients: {
                        include: {
                            user: true,
                        },
                    },
                },
            });

            return new NotificationDto(notification);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.notificationErrorMapping);
        }
    }

    /**
     * Update a notification record
     * @param id - The notification ID to update
     * @param updateNotificationData - Partial notification input data
     * @returns Promise<NotificationDto> The updated notification DTO
     * @throws NotFoundException when notification is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(
        id: string,
        updateNotificationData: Partial<NotificationInput>,
    ): Promise<NotificationDto> {
        try {
            const {
                type,
                action,
                priority,
                data,
                isActive,
                expiresAt,
            }: Partial<NotificationInput> = updateNotificationData;

            // Check if notification exists
            const existingNotification = await this.prismaService.notification.findUnique({
                where: { id },
            });

            if (!existingNotification) {
                throw new NotFoundException(`Notification with ID ${id} not found`);
            }

            // Prepare update data
            const updateData = {
                ...(type !== undefined && { type }),
                ...(action !== undefined && { action }),
                ...(priority !== undefined && { priority }),
                ...(data !== undefined && { data }),
                ...(isActive !== undefined && { isActive }),
                ...(expiresAt !== undefined && { expiresAt }),
            };

            const notification = await this.prismaService.notification.update({
                where: { id },
                data: updateData,
                include: {
                    notificationRecipients: {
                        include: {
                            user: true,
                        },
                    },
                },
            });

            return new NotificationDto(notification);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.notificationErrorMapping);
        }
    }

    /**
     * Update notification status for a specific user
     * @param notificationId - The notification ID
     * @param userId - The user ID
     * @param updateData - Status update data
     * @returns Promise<NotificationDto> The updated notification DTO
     * @throws NotFoundException when notification or recipient not found
     * @throws ForbiddenException when user is not a recipient
     */
    public async updateUserStatus(
        notificationId: string,
        userId: string,
        updateData: UpdateNotificationStatusInput,
    ): Promise<NotificationDto> {
        try {
            // Check if the user is a recipient of this notification
            const recipient = await this.prismaService.notificationRecipient.findUnique({
                where: {
                    notificationId_userId: {
                        notificationId,
                        userId,
                    },
                },
            });

            if (!recipient) {
                throw new ForbiddenException('User is not a recipient of this notification');
            }

            // Update the recipient status
            await this.prismaService.notificationRecipient.update({
                where: {
                    notificationId_userId: {
                        notificationId,
                        userId,
                    },
                },
                data: updateData,
            });

            // Return the updated notification
            return this.findOne(notificationId);
        } catch (error: unknown) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.notificationErrorMapping);
        }
    }

    /**
     * Mark all notifications as read for a user
     * @param userId - The user ID
     * @returns Promise<number> Number of notifications marked as read
     */
    public async markAllAsRead(userId: string): Promise<number> {
        try {
            const result = await this.prismaService.notificationRecipient.updateMany({
                where: {
                    userId,
                    isRead: false,
                    isDeleted: false,
                },
                data: {
                    isRead: true,
                },
            });

            return result.count;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'update', this.notificationErrorMapping);
        }
    }

    /**
     * Get unread notification count for a user
     * @param userId - The user ID
     * @returns Promise<number> Number of unread notifications
     */
    public async getUnreadCount(userId: string): Promise<number> {
        try {
            return await this.prismaService.notificationRecipient.count({
                where: {
                    userId,
                    isRead: false,
                    isDeleted: false,
                    notification: {
                        isActive: true,
                        expiresAt: {
                            gt: new Date(),
                        },
                    },
                },
            });
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.notificationErrorMapping);
        }
    }

    /**
     * Delete a notification from the database
     * @param id - The notification ID to delete
     * @returns Promise<NotificationDto> The deleted notification DTO
     * @throws PrismaError when database operation fails or notification not found
     */
    public async delete(id: string): Promise<NotificationDto> {
        try {
            const notification = await this.prismaService.notification.delete({
                where: { id },
                include: {
                    notificationRecipients: {
                        include: {
                            user: true,
                        },
                    },
                },
            });

            return new NotificationDto(notification);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.notificationErrorMapping);
        }
    }

    /**
     * Clean up expired notifications
     * @returns Promise<number> Number of notifications cleaned up
     */
    public async cleanupExpired(): Promise<number> {
        try {
            const result = await this.prismaService.notification.deleteMany({
                where: {
                    expiresAt: {
                        lt: new Date(),
                    },
                },
            });

            return result.count;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.notificationErrorMapping);
        }
    }
}
