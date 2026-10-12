import { UserRole } from '@prisma/client';
import { NotificationNotFoundException } from '../exceptions';
import { NotificationRepository } from '../repositories';
import { NotificationService } from './notification.service';

// The caller-scoped methods are the subject of this ticket; declaring them keeps the spec type-safe before they exist.
type TScopedNotificationService = {
    deleteForUser: (id: string, userId: string) => Promise<unknown>;
    findOneForUser: (id: string, userId: string) => Promise<{ recipients?: Array<{ userId: string }> }>;
    findOneFor: (id: string, user: { id: string; role: UserRole }) => Promise<unknown>;
    markAsRead: (id: string, userId: string) => Promise<unknown>;
};

describe('NotificationService caller scoping', () => {
    const now = new Date();
    const notification = (recipientUserId: string) => ({
        id: 'n1',
        type: 'SYSTEM',
        action: 'CREATE',
        priority: 'LOW',
        data: { message: 'hello' },
        isActive: true,
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
        notificationRecipients: [
            {
                id: 'r1',
                notificationId: 'n1',
                userId: recipientUserId,
                isRead: false,
                isDeleted: false,
                createdAt: now,
                updatedAt: now,
                user: undefined,
            },
        ],
    });

    const createService = (repo: Record<string, jest.Mock>) => {
        const notificationRepository = {
            findByIdForRecipient: jest.fn(),
            findByIdWithRecipients: jest.fn(),
            findRecipient: jest.fn(),
            updateRecipient: jest.fn().mockResolvedValue({}),
            deleteById: jest.fn(),
            ...repo,
        };
        const service = new NotificationService(notificationRepository as unknown as NotificationRepository);
        return { service: service as unknown as TScopedNotificationService, notificationRepository };
    };

    it('deleteForUser hides the notification for the caller only and never hard-deletes it', async () => {
        const { service, notificationRepository } = createService({
            findRecipient: jest.fn().mockResolvedValue({ id: 'r1' }),
            findByIdForRecipient: jest.fn().mockResolvedValue(notification('u1')),
        });

        await service.deleteForUser('n1', 'u1');

        expect(notificationRepository.updateRecipient).toHaveBeenCalledWith('n1', 'u1', { isDeleted: true });
        expect(notificationRepository.deleteById).not.toHaveBeenCalled();
    });

    it('deleteForUser rejects a caller who is not a recipient', async () => {
        const { service, notificationRepository } = createService({
            findRecipient: jest.fn().mockResolvedValue(null),
        });

        await expect(service.deleteForUser('n1', 'u2')).rejects.toBeInstanceOf(NotificationNotFoundException);
        expect(notificationRepository.updateRecipient).not.toHaveBeenCalled();
        expect(notificationRepository.deleteById).not.toHaveBeenCalled();
    });

    it('findOneForUser returns 404 for a non-recipient', async () => {
        const { service } = createService({
            findByIdForRecipient: jest.fn().mockResolvedValue(null),
        });

        await expect(service.findOneForUser('n1', 'u2')).rejects.toBeInstanceOf(NotificationNotFoundException);
    });

    it('findOneForUser returns only the caller recipient entry', async () => {
        const { service } = createService({
            findByIdForRecipient: jest.fn().mockResolvedValue(notification('u1')),
        });

        const result = await service.findOneForUser('n1', 'u1');

        expect(result.recipients).toHaveLength(1);
        expect(result.recipients?.[0]?.userId).toBe('u1');
    });

    it('markAsRead rejects a non-recipient without touching any recipient row', async () => {
        const { service, notificationRepository } = createService({
            findRecipient: jest.fn().mockResolvedValue(null),
        });

        await expect(service.markAsRead('n1', 'u2')).rejects.toBeInstanceOf(NotificationNotFoundException);
        expect(notificationRepository.updateRecipient).not.toHaveBeenCalled();
    });

    it('markAsRead marks only the caller recipient row as read', async () => {
        const { service, notificationRepository } = createService({
            findRecipient: jest.fn().mockResolvedValue({ id: 'r1' }),
            findByIdForRecipient: jest.fn().mockResolvedValue(notification('u1')),
        });

        await service.markAsRead('n1', 'u1');

        expect(notificationRepository.updateRecipient).toHaveBeenCalledWith('n1', 'u1', { isRead: true });
    });

    it('findOneFor returns the full notification for an admin', async () => {
        const { service, notificationRepository } = createService({
            findByIdWithRecipients: jest.fn().mockResolvedValue(notification('u1')),
        });

        await service.findOneFor('n1', { id: 'a1', role: UserRole.ADMIN });

        expect(notificationRepository.findByIdWithRecipients).toHaveBeenCalledWith('n1');
        expect(notificationRepository.findByIdForRecipient).not.toHaveBeenCalled();
    });

    it('findOneFor scopes a non-admin to their own recipient entry', async () => {
        const { service, notificationRepository } = createService({
            findByIdForRecipient: jest.fn().mockResolvedValue(notification('u1')),
        });

        await service.findOneFor('n1', { id: 'u1', role: UserRole.MEMBER });

        expect(notificationRepository.findByIdForRecipient).toHaveBeenCalledWith('n1', 'u1');
        expect(notificationRepository.findByIdWithRecipients).not.toHaveBeenCalled();
    });
});
