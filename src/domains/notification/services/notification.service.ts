import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { IResponse } from '@/shared';
import { PrismaErrorHandler } from '@/shared/handlers/error.handler';
import { NotificationDto, NotificationInput, UpdateNotificationStatusInput } from '../dto';
import { NotificationRepository } from '../repositories';

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

    public constructor(private readonly notificationRepository: NotificationRepository) {}

    /**
     * Find all notifications in the database
     * @returns Promise<NotificationDto[]> Array of notification DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<IResponse<NotificationDto[]>> {
        try {
            const notifications = await this.notificationRepository.findAllWithRecipients();

            return {
                items: notifications.map((notification) => new NotificationDto(notification)),
                statusCode: HttpStatus.OK,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.notificationErrorMapping);
        }
    }

    /**
     * Find notifications for a specific user
     * @param userId - The user ID to get notifications for
     * @param includeDeleted - Whether to include deleted notifications
     * @param isRead - Filter by read status (undefined = all, true = read only, false = unread only)
     * @returns Promise<IResponse<NotificationDto[]>> Array of notification DTOs
     */
    public async findByUser(
        userId: string,
        includeDeleted: boolean = false,
        isRead?: boolean,
    ): Promise<IResponse<NotificationDto[]>> {
        try {
            const notifications = await this.notificationRepository.findManyForUser(
                userId,
                includeDeleted,
                isRead,
            );

            return {
                items: notifications.map((notification) => new NotificationDto(notification)),
                statusCode: HttpStatus.OK,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.notificationErrorMapping);
        }
    }

    /**
     * Find unread notifications for a specific user
     * @param userId - The user ID to get unread notifications for
     * @returns Promise<IResponse<NotificationDto[]>> Array of unread notification DTOs
     */
    public async findUnreadByUser(userId: string): Promise<IResponse<NotificationDto[]>> {
        return this.findByUser(userId, false, false);
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
            const notification = await this.notificationRepository.findByIdWithRecipients(id);

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
            const notification =
                await this.notificationRepository.createWithRecipients(createNotificationData);

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
            const existingNotification = await this.notificationRepository.findById(id);

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

            const notification = await this.notificationRepository.updateById(id, updateData);

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
            const recipient = await this.notificationRepository.findRecipient(
                notificationId,
                userId,
            );

            if (!recipient) {
                throw new ForbiddenException('User is not a recipient of this notification');
            }

            // Update the recipient status
            await this.notificationRepository.updateRecipient(notificationId, userId, updateData);

            // Return the updated notification
            return this.findOne(notificationId);
        } catch (error: unknown) {
            if (error instanceof NotFoundException || error instanceof ForbiddenException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.notificationErrorMapping);
        }
    }

    public async markAsRead(notificationId: string, userId: string): Promise<NotificationDto> {
        try {
            await this.notificationRepository.updateRecipient(notificationId, userId, {
                isRead: true,
            });

            return this.findOne(notificationId);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'update', this.notificationErrorMapping);
            throw error;
        }
    }

    /**
     * Mark all notifications as read for a user
     * @param userId - The user ID
     * @returns Promise<number> Number of notifications marked as read
     */
    public async markAllAsRead(userId: string): Promise<number> {
        try {
            return this.notificationRepository.markAllAsReadForUser(userId);
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
            return this.notificationRepository.countUnreadForUser(userId);
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
            const notification = await this.notificationRepository.deleteById(id);

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
            return this.notificationRepository.deleteManyExpired();
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.notificationErrorMapping);
        }
    }
}
