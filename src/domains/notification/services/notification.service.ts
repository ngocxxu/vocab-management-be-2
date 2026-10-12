import { IResponse } from '@/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { NotificationDto, NotificationInput, UpdateNotificationInput, UpdateNotificationStatusInput } from '../dto';
import { NotificationForbiddenException, NotificationNotFoundException } from '../exceptions';
import { NotificationRepository } from '../repositories';

@Injectable()
export class NotificationService {
    public constructor(private readonly notificationRepository: NotificationRepository) {}

    public async find(): Promise<IResponse<NotificationDto[]>> {
        const notifications = await this.notificationRepository.findAllWithRecipients();

        return {
            items: notifications.map((notification) => new NotificationDto(notification)),
            statusCode: HttpStatus.OK,
        };
    }

    public async findByUser(userId: string, includeDeleted: boolean = false, isRead?: boolean): Promise<IResponse<NotificationDto[]>> {
        const notifications = await this.notificationRepository.findManyForUser(userId, includeDeleted, isRead);

        return {
            items: notifications.map((notification) => new NotificationDto(notification)),
            statusCode: HttpStatus.OK,
        };
    }

    public async findUnreadByUser(userId: string): Promise<IResponse<NotificationDto[]>> {
        return this.findByUser(userId, false, false);
    }

    public async findOne(id: string): Promise<NotificationDto> {
        const notification = await this.notificationRepository.findByIdWithRecipients(id);

        if (!notification) {
            throw new NotificationNotFoundException(id);
        }

        return new NotificationDto(notification);
    }

    /** Admins see the full notification; everyone else gets the caller-scoped view. */
    public async findOneFor(id: string, user: Pick<User, 'id' | 'role'>): Promise<NotificationDto> {
        return user.role === UserRole.ADMIN ? this.findOne(id) : this.findOneForUser(id, user.id);
    }

    /** Caller-scoped lookup: non-recipients get 404 and only the caller's recipient row is returned. */
    public async findOneForUser(id: string, userId: string): Promise<NotificationDto> {
        const notification = await this.notificationRepository.findByIdForRecipient(id, userId);

        if (!notification) {
            throw new NotificationNotFoundException(id);
        }

        return new NotificationDto(notification);
    }

    /** Hides the notification for this user only; other recipients keep it. */
    public async deleteForUser(id: string, userId: string): Promise<NotificationDto> {
        const recipient = await this.notificationRepository.findRecipient(id, userId);

        if (!recipient) {
            throw new NotificationNotFoundException(id);
        }

        await this.notificationRepository.updateRecipient(id, userId, { isDeleted: true });

        return this.findOneForUser(id, userId);
    }

    public async create(createNotificationData: NotificationInput): Promise<NotificationDto> {
        const notification = await this.notificationRepository.createWithRecipients(createNotificationData);

        return new NotificationDto(notification);
    }

    public async update(id: string, updateNotificationData: UpdateNotificationInput): Promise<NotificationDto> {
        const { type, action, priority, data, isActive, expiresAt } = updateNotificationData;

        const existingNotification = await this.notificationRepository.findById(id);

        if (!existingNotification) {
            throw new NotificationNotFoundException(id);
        }

        const updateData: Prisma.NotificationUpdateInput = {
            ...(type !== undefined && { type }),
            ...(action !== undefined && { action }),
            ...(priority !== undefined && { priority }),
            ...(data !== undefined && { data: data as Prisma.InputJsonValue }),
            ...(isActive !== undefined && { isActive }),
            ...(expiresAt !== undefined && { expiresAt }),
        };

        const notification = await this.notificationRepository.updateById(id, updateData);

        return new NotificationDto(notification);
    }

    public async updateUserStatus(notificationId: string, userId: string, updateData: UpdateNotificationStatusInput): Promise<NotificationDto> {
        const recipient = await this.notificationRepository.findRecipient(notificationId, userId);

        if (!recipient) {
            throw new NotificationForbiddenException();
        }

        await this.notificationRepository.updateRecipient(notificationId, userId, updateData);

        return this.findOneForUser(notificationId, userId);
    }

    public async markAsRead(notificationId: string, userId: string): Promise<NotificationDto> {
        const recipient = await this.notificationRepository.findRecipient(notificationId, userId);

        if (!recipient) {
            throw new NotificationNotFoundException(notificationId);
        }

        await this.notificationRepository.updateRecipient(notificationId, userId, {
            isRead: true,
        });

        return this.findOneForUser(notificationId, userId);
    }

    public async markAllAsRead(userId: string): Promise<number> {
        return this.notificationRepository.markAllAsReadForUser(userId);
    }

    public async getUnreadCount(userId: string): Promise<number> {
        return this.notificationRepository.countUnreadForUser(userId);
    }

    public async delete(id: string): Promise<NotificationDto> {
        await this.findOne(id);
        const notification = await this.notificationRepository.deleteById(id);

        return new NotificationDto(notification);
    }

    public async cleanupExpired(): Promise<number> {
        return this.notificationRepository.deleteManyExpired();
    }
}
