import { EReminderNotificationKind } from '@/domains/reminder/utils';
import type { PrismaService } from '@/shared';
import { NotificationAction, NotificationType, Prisma, PriorityLevel } from '@prisma/client';
import { NotificationRepository } from './notification.repository';

const NOTIFICATION = {
    type: NotificationType.SYSTEM,
    action: NotificationAction.MULTI_CREATE,
    priority: PriorityLevel.HIGH,
    data: { message: 'Maintenance tonight' },
    isActive: true,
    expiresAt: new Date('2030-01-01T00:00:00Z'),
};

const userIds = (count: number) => Array.from({ length: count }, (_, index) => `user-${index + 1}`);

const createRepository = () => {
    const tx = {
        notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
        notificationRecipient: {
            createMany: jest.fn<Promise<{ count: number }>, [{ data: Array<{ notificationId: string; userId: string }> }]>().mockResolvedValue({ count: 0 }),
        },
    };
    const repository = new NotificationRepository({} as PrismaService);
    const inTransaction = jest.spyOn(repository, 'inTransaction').mockImplementation(async (fn) => fn(tx as unknown as Prisma.TransactionClient));

    return { repository, tx, inTransaction };
};

describe('NotificationRepository.createBroadcast', () => {
    it('writes recipients in chunks of 500 and keeps the last chunk short', async () => {
        const { repository, tx } = createRepository();

        await repository.createBroadcast(NOTIFICATION, userIds(1201));

        const chunkSizes = tx.notificationRecipient.createMany.mock.calls.map(([args]) => args.data.length);
        expect(chunkSizes).toEqual([500, 500, 201]);
    });

    it('attaches every recipient to the one notification it creates', async () => {
        const { repository, tx } = createRepository();

        await repository.createBroadcast(NOTIFICATION, userIds(3));

        const written = tx.notificationRecipient.createMany.mock.calls.flatMap(([args]) => args.data);
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
        expect(written).toEqual([
            { notificationId: 'n1', userId: 'user-1' },
            { notificationId: 'n1', userId: 'user-2' },
            { notificationId: 'n1', userId: 'user-3' },
        ]);
    });

    it('gives the transaction 60 seconds, since a large audience takes more than the default 5', async () => {
        const { repository, inTransaction } = createRepository();

        await repository.createBroadcast(NOTIFICATION, userIds(1201));

        expect(inTransaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
    });

    it('runs the notification and every chunk in one transaction and returns the notification', async () => {
        const { repository, inTransaction } = createRepository();

        const notification = await repository.createBroadcast(NOTIFICATION, userIds(1201));

        expect(inTransaction).toHaveBeenCalledTimes(1);
        expect(notification).toEqual({ id: 'n1' });
    });
});

describe('NotificationRepository.findOpenReminderBellTrainerIds', () => {
    const createRepositoryWithBells = (rows: Array<{ data: unknown }>) => {
        const prisma = { notification: { findMany: jest.fn().mockResolvedValue(rows) } };
        const repository = new NotificationRepository(prisma as unknown as PrismaService);

        return { repository, prisma };
    };

    it('returns the trainer once when it has an initial and an escalation Bell', async () => {
        const { repository } = createRepositoryWithBells([
            { data: { trainerId: 'trainer-1', kind: EReminderNotificationKind.INITIAL } },
            { data: { trainerId: 'trainer-1', kind: EReminderNotificationKind.ESCALATION } },
        ]);

        await expect(repository.findOpenReminderBellTrainerIds('user-1')).resolves.toEqual(['trainer-1']);
    });

    it('keeps the trainer of an escalation Bell', async () => {
        const { repository } = createRepositoryWithBells([{ data: { trainerId: 'trainer-2', kind: EReminderNotificationKind.ESCALATION } }]);

        await expect(repository.findOpenReminderBellTrainerIds('user-1')).resolves.toEqual(['trainer-2']);
    });

    it('leaves out the FSRS due Bells', async () => {
        const { repository } = createRepositoryWithBells([{ data: { trainerId: 'trainer-3', kind: EReminderNotificationKind.FSRS_DUE } }]);

        await expect(repository.findOpenReminderBellTrainerIds('user-1')).resolves.toEqual([]);
    });

    it('ignores a Bell whose data has no trainer id', async () => {
        const { repository } = createRepositoryWithBells([{ data: { kind: EReminderNotificationKind.INITIAL } }, { data: null }, { data: 'not an object' }]);

        await expect(repository.findOpenReminderBellTrainerIds('user-1')).resolves.toEqual([]);
    });

    it('leaves out a Bell that has a trainer id but no kind', async () => {
        const { repository } = createRepositoryWithBells([{ data: { trainerId: 'trainer-4' } }]);

        await expect(repository.findOpenReminderBellTrainerIds('user-1')).resolves.toEqual([]);
    });

    it('reads only active Reminder Bells of the user that have not expired', async () => {
        const { repository, prisma } = createRepositoryWithBells([]);

        await repository.findOpenReminderBellTrainerIds('user-1');

        expect(prisma.notification.findMany).toHaveBeenCalledWith({
            where: {
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                isActive: true,
                expiresAt: { gt: expect.any(Date) },
                notificationRecipients: { some: { userId: 'user-1' } },
            },
            select: { data: true },
        });
    });
});
