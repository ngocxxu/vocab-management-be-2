import { BadRequestException } from '@nestjs/common';
import { NotificationType, PriorityLevel, UserRole } from '@prisma/client';
import { BroadcastNotificationInput, BroadcastTarget } from '../dto';
import { NotificationExpiryInPastException, NotificationNoRecipientsException } from '../exceptions';
import { NotificationRepository } from '../repositories';
import { NotificationService } from './notification.service';

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

const broadcastInput = (overrides: Partial<BroadcastNotificationInput>): BroadcastNotificationInput => ({
    message: 'Maintenance tonight',
    priority: PriorityLevel.HIGH,
    expiresAt: FUTURE,
    target: BroadcastTarget.ALL,
    ...overrides,
});

const createRepository = () => ({
    findActiveUserIds: jest.fn().mockResolvedValue(['u1', 'u2', 'u3']),
    findActiveUserIdsIn: jest.fn().mockResolvedValue([]),
    createBroadcast: jest.fn().mockResolvedValue(undefined),
});

const createService = (repository: ReturnType<typeof createRepository>) => new NotificationService(repository as unknown as NotificationRepository);

describe('NotificationService.broadcast', () => {
    it('sends to every active user when the target is all', async () => {
        const repository = createRepository();

        await createService(repository).broadcast(broadcastInput({ target: BroadcastTarget.ALL }));

        expect(repository.createBroadcast).toHaveBeenCalledWith(expect.anything(), ['u1', 'u2', 'u3']);
    });

    it('sends only to active users of the chosen role', async () => {
        const repository = createRepository();
        repository.findActiveUserIds.mockImplementation((role?: UserRole) => (role === UserRole.MEMBER ? ['m1', 'm2'] : ['x']));

        await createService(repository).broadcast(broadcastInput({ target: BroadcastTarget.ROLE, role: UserRole.MEMBER }));

        expect(repository.createBroadcast).toHaveBeenCalledWith(expect.anything(), ['m1', 'm2']);
    });

    it('sends to the selected users without asking for duplicates twice', async () => {
        const repository = createRepository();
        repository.findActiveUserIdsIn.mockResolvedValue(['u1', 'u2']);

        await createService(repository).broadcast(broadcastInput({ target: BroadcastTarget.USERS, userIds: ['u1', 'u1', 'u2'] }));

        expect(repository.findActiveUserIdsIn).toHaveBeenCalledWith(['u1', 'u2']);
        expect(repository.createBroadcast).toHaveBeenCalledWith(expect.anything(), ['u1', 'u2']);
    });

    it('returns the recipient count only', async () => {
        const repository = createRepository();

        const result = await createService(repository).broadcast(broadcastInput({ target: BroadcastTarget.ALL }));

        expect(result).toEqual({ count: 3 });
    });

    it('stores the message as the data of a system notification with the chosen priority and expiry', async () => {
        const repository = createRepository();

        await createService(repository).broadcast(broadcastInput({ target: BroadcastTarget.ALL }));

        expect(repository.createBroadcast).toHaveBeenCalledWith(
            expect.objectContaining({
                type: NotificationType.SYSTEM,
                priority: PriorityLevel.HIGH,
                data: { message: 'Maintenance tonight' },
                expiresAt: FUTURE,
                isActive: true,
            }),
            ['u1', 'u2', 'u3'],
        );
    });

    it('rejects with a 400 and writes nothing when no recipient resolves', async () => {
        const repository = createRepository();
        repository.findActiveUserIdsIn.mockResolvedValue([]);

        const attempt = createService(repository).broadcast(broadcastInput({ target: BroadcastTarget.USERS, userIds: ['ghost'] }));

        await expect(attempt).rejects.toBeInstanceOf(NotificationNoRecipientsException);
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        expect(repository.createBroadcast).not.toHaveBeenCalled();
    });

    it('rejects with a 400 and resolves no recipients when the expiry is already past', async () => {
        const repository = createRepository();

        const attempt = createService(repository).broadcast(broadcastInput({ expiresAt: PAST }));

        await expect(attempt).rejects.toBeInstanceOf(NotificationExpiryInPastException);
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        expect(repository.findActiveUserIds).not.toHaveBeenCalled();
        expect(repository.createBroadcast).not.toHaveBeenCalled();
    });
});
