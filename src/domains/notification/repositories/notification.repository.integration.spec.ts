import { EReminderNotificationKind } from '@/domains/reminder/utils';
import { PrismaService } from '@/shared/services/prisma.service';
import { NotificationAction, NotificationType, PriorityLevel, TrainerMode, TrainerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { NotificationRepository } from './notification.repository';

// Runs against a real Postgres (the open Bell query is a database query):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test notification.repository.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

type BellOptions = {
    trainer?: string;
    kind?: string;
    action?: NotificationAction;
    isActive?: boolean;
    expiresAt?: Date;
    recipients?: Array<{ userId: string; isDeleted?: boolean; isRead?: boolean }>;
};

describeWithDb('NotificationRepository.findOpenReminderBellTrainerIds (real Postgres)', () => {
    const specTag = `open-bells-${randomUUID()}`;
    let prisma: PrismaService;
    let repository: NotificationRepository;
    let user: { id: string };
    let otherUser: { id: string };
    let trainerId: string;
    let otherTrainerId: string;

    const createTrainer = async (userId: string): Promise<string> => {
        const trainer = await prisma.vocabTrainer.create({
            data: { name: 'Classic', status: TrainerStatus.IN_PROCESS, questionType: 'FLIP_CARD', mode: TrainerMode.CLASSIC, reminderRepeat: 0, userId },
        });

        return trainer.id;
    };

    const createBell = async (options: BellOptions = {}) =>
        prisma.notification.create({
            data: {
                type: NotificationType.VOCAB_TRAINER,
                action: options.action ?? NotificationAction.REMIND,
                priority: PriorityLevel.LOW,
                data: { trainerId: options.trainer ?? trainerId, kind: options.kind ?? EReminderNotificationKind.INITIAL, specTag },
                isActive: options.isActive ?? true,
                expiresAt: options.expiresAt ?? new Date(Date.now() + 90 * DAY_MS),
                notificationRecipients: { create: options.recipients ?? [{ userId: user.id }] },
            },
        });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        await prisma.$connect();
        repository = new NotificationRepository(prisma);
        user = await prisma.user.create({ data: { email: `open-bells-spec-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
        otherUser = await prisma.user.create({ data: { email: `open-bells-spec-${randomUUID()}@example.com`, firstName: 'Grace', lastName: 'Hopper' } });
    });

    afterAll(async () => {
        await prisma.notification.deleteMany({ where: { data: { path: ['specTag'], equals: specTag } } });
        await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.notification.deleteMany({ where: { data: { path: ['specTag'], equals: specTag } } });
        trainerId = await createTrainer(user.id);
        otherTrainerId = await createTrainer(otherUser.id);
    });

    test('returns the trainer of an open Reminder Bell of the user', async () => {
        // Arrange
        await createBell();

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([trainerId]);
    });

    test('returns a trainer once when it has an initial and an escalation Bell', async () => {
        // Arrange
        await createBell({ kind: EReminderNotificationKind.INITIAL });
        await createBell({ kind: EReminderNotificationKind.ESCALATION });

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([trainerId]);
    });

    test('keeps a Bell that the user has read', async () => {
        // Arrange
        await createBell({ recipients: [{ userId: user.id, isRead: true }] });

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([trainerId]);
    });

    test('leaves out a hidden Bell (isActive false)', async () => {
        // Arrange
        await createBell({ isActive: false });

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([]);
    });

    test('leaves out a Bell of another user', async () => {
        // Arrange
        await createBell({ trainer: otherTrainerId, recipients: [{ userId: otherUser.id }] });

        // Act
        const ownIds = await repository.findOpenReminderBellTrainerIds(user.id);
        const otherIds = await repository.findOpenReminderBellTrainerIds(otherUser.id);

        // Assert
        expect(ownIds).toEqual([]);
        expect(otherIds).toEqual([otherTrainerId]);
    });

    test('leaves out a Bell that has expired', async () => {
        // Arrange
        await createBell({ expiresAt: new Date(Date.now() - DAY_MS) });

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([]);
    });

    test('keeps a Bell that the user has deleted, since the exam is still due', async () => {
        // Arrange
        await createBell({ recipients: [{ userId: user.id, isDeleted: true }] });

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([trainerId]);
    });

    test('leaves out grading Bells and FSRS due Bells', async () => {
        // Arrange
        await createBell({ action: NotificationAction.CREATE });
        await createBell({ kind: EReminderNotificationKind.FSRS_DUE });

        // Act
        const ids = await repository.findOpenReminderBellTrainerIds(user.id);

        // Assert
        expect(ids).toEqual([]);
    });
});
