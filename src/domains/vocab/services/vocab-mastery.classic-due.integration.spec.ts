import { NotificationRepository } from '@/domains/notification/repositories/notification.repository';
import { NotificationService } from '@/domains/notification/services/notification.service';
import { ConfigRepository } from '@/domains/platform/config/repositories';
import { ConfigService } from '@/domains/platform/config/services/config.service';
import { EReminderNotificationKind } from '@/domains/reminder/utils';
import { PrismaService } from '@/shared/services/prisma.service';
import { NotificationAction, NotificationType, PriorityLevel, QuestionType, TrainerMode, TrainerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FsrsRepository } from '../repositories/fsrs.repository';
import { VocabMasteryRepository } from '../repositories/vocab-mastery.repository';
import { FsrsStatsService } from './fsrs-stats.service';
import { FsrsService } from './fsrs.service';
import { VocabMasteryService } from './vocab-mastery.service';

// Runs against a real Postgres (the Classic due count reads the Bell rows and the trainer rows):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-mastery.classic-due
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

describeWithDb('Classic exam due in the dashboard summary (real Postgres)', () => {
    const specTag = `classic-due-${randomUUID()}`;
    let prisma: PrismaService;
    let masteryService: VocabMasteryService;
    let user: { id: string };
    let otherUser: { id: string };

    const createTrainer = async (mode: TrainerMode, questionType: QuestionType, userId: string): Promise<string> => {
        const trainer = await prisma.vocabTrainer.create({
            data: { name: mode, status: TrainerStatus.IN_PROCESS, questionType, mode, reminderRepeat: 0, userId },
        });

        return trainer.id;
    };

    // kind: null writes a Bell with no kind at all, which the count must leave out.
    const createBell = async (trainerId: string, options: { kind?: string | null; isActive?: boolean; userId?: string } = {}) => {
        const kind = options.kind === undefined ? EReminderNotificationKind.INITIAL : options.kind;

        return prisma.notification.create({
            data: {
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.REMIND,
                priority: PriorityLevel.LOW,
                data: { trainerId, ...(kind !== null && { kind }), specTag },
                isActive: options.isActive ?? true,
                expiresAt: new Date(Date.now() + 90 * DAY_MS),
                notificationRecipients: { create: [{ userId: options.userId ?? user.id }] },
            },
        });
    };

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        await prisma.$connect();
        const fsrsStats = new FsrsStatsService(new FsrsRepository(prisma), new FsrsService(), new ConfigService(new ConfigRepository(prisma)));
        masteryService = new VocabMasteryService(
            new VocabMasteryRepository(prisma),
            { countByUserId: jest.fn().mockResolvedValue(0) } as never,
            fsrsStats,
            new NotificationService(new NotificationRepository(prisma)),
            { error: jest.fn() } as never,
        );
        user = await prisma.user.create({ data: { email: `classic-due-spec-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
        otherUser = await prisma.user.create({ data: { email: `classic-due-spec-${randomUUID()}@example.com`, firstName: 'Grace', lastName: 'Hopper' } });
    });

    afterAll(async () => {
        await prisma.notification.deleteMany({ where: { data: { path: ['specTag'], equals: specTag } } });
        await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.notification.deleteMany({ where: { data: { path: ['specTag'], equals: specTag } } });
    });

    test('counts one Classic trainer with an open Bell and names it with its question type', async () => {
        // Arrange
        const trainerId = await createTrainer(TrainerMode.CLASSIC, QuestionType.TRUE_OR_FALSE, user.id);
        await createBell(trainerId);

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(1);
        expect(summary.classicDueTrainer).toEqual({ trainerId, questionType: QuestionType.TRUE_OR_FALSE });
    });

    test('counts a trainer once when it has an initial and an escalation Bell', async () => {
        // Arrange
        const trainerId = await createTrainer(TrainerMode.CLASSIC, QuestionType.FLIP_CARD, user.id);
        await createBell(trainerId, { kind: EReminderNotificationKind.INITIAL });
        await createBell(trainerId, { kind: EReminderNotificationKind.ESCALATION });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(1);
        expect(summary.classicDueTrainer?.trainerId).toBe(trainerId);
    });

    test('gives a count and no target when two Classic trainers are due', async () => {
        // Arrange
        const first = await createTrainer(TrainerMode.CLASSIC, QuestionType.FLIP_CARD, user.id);
        const second = await createTrainer(TrainerMode.CLASSIC, QuestionType.MULTIPLE_CHOICE, user.id);
        await createBell(first);
        await createBell(second, { kind: EReminderNotificationKind.ESCALATION });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(2);
        expect(summary.classicDueTrainer).toBeNull();
    });

    test('counts only the Classic trainer when an FSRS trainer also has a Bell', async () => {
        // Arrange
        const classicTrainerId = await createTrainer(TrainerMode.CLASSIC, QuestionType.FLIP_CARD, user.id);
        const fsrsTrainerId = await createTrainer(TrainerMode.FSRS, QuestionType.FLIP_CARD, user.id);
        await createBell(classicTrainerId);
        await createBell(fsrsTrainerId, { kind: EReminderNotificationKind.FSRS_DUE });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(1);
        expect(summary.classicDueTrainer).toEqual({ trainerId: classicTrainerId, questionType: QuestionType.FLIP_CARD });
    });

    test('leaves out an FSRS trainer and its FSRS due Bell, and keeps the FSRS counts', async () => {
        // Arrange
        const fsrsTrainerId = await createTrainer(TrainerMode.FSRS, QuestionType.FLIP_CARD, user.id);
        await createBell(fsrsTrainerId, { kind: EReminderNotificationKind.FSRS_DUE });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(0);
        expect(summary.classicDueTrainer).toBeNull();
        expect(summary).toMatchObject({ fsrsDueToday: 0, fsrsMastered: 0 });
    });

    test('leaves out an FSRS trainer even when its Bell is not an FSRS due one', async () => {
        // Arrange
        const fsrsTrainerId = await createTrainer(TrainerMode.FSRS, QuestionType.FLIP_CARD, user.id);
        await createBell(fsrsTrainerId, { kind: EReminderNotificationKind.INITIAL });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(0);
    });

    test('leaves out a trainer that is gone', async () => {
        // Arrange
        await createBell(randomUUID());

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(0);
    });

    test('leaves out a Bell of another user', async () => {
        // Arrange
        const otherTrainerId = await createTrainer(TrainerMode.CLASSIC, QuestionType.FLIP_CARD, otherUser.id);
        await createBell(otherTrainerId, { userId: otherUser.id });

        // Act
        const summary = await masteryService.getSummary(user.id);
        const otherSummary = await masteryService.getSummary(otherUser.id);

        // Assert
        expect(summary.classicDueCount).toBe(0);
        expect(otherSummary.classicDueTrainer).toEqual({ trainerId: otherTrainerId, questionType: QuestionType.FLIP_CARD });
    });

    test('leaves out a hidden Bell', async () => {
        // Arrange
        const trainerId = await createTrainer(TrainerMode.CLASSIC, QuestionType.FLIP_CARD, user.id);
        await createBell(trainerId, { isActive: false });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(0);
    });

    test('leaves out a Classic Bell that has no kind', async () => {
        // Arrange
        const trainerId = await createTrainer(TrainerMode.CLASSIC, QuestionType.FLIP_CARD, user.id);
        await createBell(trainerId, { kind: null });

        // Act
        const summary = await masteryService.getSummary(user.id);

        // Assert
        expect(summary.classicDueCount).toBe(0);
        expect(summary.classicDueTrainer).toBeNull();
    });
});
