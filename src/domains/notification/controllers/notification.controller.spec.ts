import { LoggerService } from '@/shared/services/logger.service';
import { User, UserRole } from '@prisma/client';
import { NotificationService } from '../services';
import { NotificationController } from './notification.controller';

describe('NotificationController caller scoping', () => {
    const member = { id: 'u1', role: UserRole.MEMBER } as User;
    const admin = { id: 'a1', role: UserRole.ADMIN } as User;

    const createController = () => {
        const notificationService = {
            markAllAsRead: jest.fn().mockResolvedValue(2),
            updateUserStatus: jest.fn().mockResolvedValue({}),
            deleteForUser: jest.fn().mockResolvedValue({}),
            findOneFor: jest.fn().mockResolvedValue({}),
        };
        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const controller = new NotificationController(logger as unknown as LoggerService, notificationService as unknown as NotificationService);
        return { controller, notificationService };
    };

    it('markAllAsRead only affects the calling user', async () => {
        const { controller, notificationService } = createController();

        await controller.markAllAsRead(member);

        expect(notificationService.markAllAsRead).toHaveBeenCalledWith('u1');
    });

    it('updateStatus records the status for the calling user, not the notification id', async () => {
        const { controller, notificationService } = createController();

        await controller.updateStatus('n1', member, { isRead: true });

        expect(notificationService.updateUserStatus).toHaveBeenCalledWith('n1', 'u1', { isRead: true });
    });

    it('deleteMy hides the notification for the calling user only', async () => {
        const { controller, notificationService } = createController();

        await controller.deleteMy('n1', member);

        expect(notificationService.deleteForUser).toHaveBeenCalledWith('n1', 'u1');
    });

    it('findOne delegates visibility to the service with the calling user', async () => {
        const { controller, notificationService } = createController();

        await controller.findOne('n1', member);
        await controller.findOne('n1', admin);

        expect(notificationService.findOneFor).toHaveBeenNthCalledWith(1, 'n1', member);
        expect(notificationService.findOneFor).toHaveBeenNthCalledWith(2, 'n1', admin);
    });
});
