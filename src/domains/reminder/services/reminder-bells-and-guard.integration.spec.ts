import { NotificationRepository } from '@/domains/notification/repositories/notification.repository';
import { NotificationService } from '@/domains/notification/services/notification.service';
import { PrismaService } from '@/shared/services/prisma.service';
import { NotificationAction, NotificationType, ReminderChannel, ReminderScheduleKind, ReminderScheduleStatus, TrainerMode, TrainerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { EEmailTemplate } from '../utils';
import { ReminderInAppNotificationService } from './reminder-in-app-notification.service';
import { ReminderSendGuardService } from './reminder-send-guard.service';

// Runs against a real Postgres (bell rows, schedule rows and the send guard are database queries):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test reminder-bells-and-guard.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const SPEC_EMAIL = 'bells-guard-spec';

describeWithDb('Reminder bells and the send guard (real Postgres)', () => {
    let prisma: PrismaService;
    let schedules: ReminderScheduleRepository;
    let bells: ReminderInAppNotificationService;
    let notificationService: NotificationService;
    let user: { id: string; email: string };
    const gateway = { sendToUser: jest.fn() };
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };

    const classicTrainer = async (name = 'Classic'): Promise<string> => {
        const trainer = await prisma.vocabTrainer.create({
            data: { name, status: TrainerStatus.PENDING, questionType: 'MULTIPLE_CHOICE', mode: TrainerMode.CLASSIC, reminderRepeat: 0, userId: user.id },
        });

        return trainer.id;
    };

    const scheduleRow = async (trainerId: string, overrides: Record<string, unknown> = {}) =>
        prisma.reminderSchedule.create({
            data: {
                dedupeKey: `bells-guard-spec:${randomUUID()}`,
                channel: ReminderChannel.EMAIL,
                recipient: user.email,
                template: EEmailTemplate.EXAM_REMINDER,
                payload: { firstName: 'Ada', testName: 'Classic', repeatDays: '2' },
                dueAt: new Date(),
                status: ReminderScheduleStatus.PENDING,
                userId: user.id,
                entityType: VOCAB_TRAINER_ENTITY,
                entityId: trainerId,
                reminderType: ReminderScheduleKind.INITIAL,
                ...overrides,
            },
        });

    const bellOf = async (scheduleId: string) => prisma.notification.findFirstOrThrow({ where: { data: { path: ['scheduleId'], equals: scheduleId } } });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        await prisma.$connect();
        schedules = new ReminderScheduleRepository(prisma);
        notificationService = new NotificationService(new NotificationRepository(prisma));
        bells = new ReminderInAppNotificationService(notificationService, gateway as never, schedules, logger as never);
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        user = await prisma.user.create({ data: { email: `${SPEC_EMAIL}-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
    });

    describe('bell lifetime', () => {
        test('a classic reminder bell stays 90 days', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            const row = await scheduleRow(trainerId, { status: ReminderScheduleStatus.SENT, sentAt: new Date() });

            // Act
            await bells.notifyReminderSent(row);

            // Assert
            const bell = await bellOf(row.id);
            expect(bell.expiresAt.getTime() - bell.createdAt.getTime()).toBeGreaterThan(90 * DAY_MS - 60_000);
            expect(bell.expiresAt.getTime() - bell.createdAt.getTime()).toBeLessThan(90 * DAY_MS + 60_000);
        });

        test('an FSRS due bell stays 90 days', async () => {
            // Arrange
            const trainer = await prisma.vocabTrainer.create({
                data: { name: 'FSRS', status: TrainerStatus.PENDING, questionType: 'FLIP_CARD', mode: TrainerMode.FSRS, reminderRepeat: 0, userId: user.id },
            });
            const row = await scheduleRow(trainer.id, { template: EEmailTemplate.FSRS_DUE_REMINDER, status: ReminderScheduleStatus.SENT, sentAt: new Date() });

            // Act
            await bells.notifyReminderSent(row);

            // Assert
            const bell = await bellOf(row.id);
            expect(bell.expiresAt.getTime() - bell.createdAt.getTime()).toBeGreaterThan(90 * DAY_MS - 60_000);
            expect(bell.expiresAt.getTime() - bell.createdAt.getTime()).toBeLessThan(90 * DAY_MS + 60_000);
        });
    });

    describe('hiding bells', () => {
        test("hides only the reminder bells of the trainer, not its completion bell or another trainer's bells", async () => {
            // Arrange
            const trainerA = await classicTrainer('A');
            const trainerB = await classicTrainer('B');
            const bellA = await scheduleRow(trainerA, { status: ReminderScheduleStatus.SENT, sentAt: new Date() });
            const bellB = await scheduleRow(trainerB, { status: ReminderScheduleStatus.SENT, sentAt: new Date() });
            await bells.notifyReminderSent(bellA);
            await bells.notifyReminderSent(bellB);
            // The completion bell carries no trainerId (as the attempt service writes it), so it is found by its message.
            const marker = randomUUID();
            await notificationService.create({
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.CREATE,
                priority: 'LOW',
                data: { trainerName: 'A', message: `Your test has been completed after 6 passes ${marker}`, completedAt: new Date().toISOString() },
                expiresAt: new Date(Date.now() + DAY_MS),
                isActive: true,
                recipientUserIds: [user.id],
            } as never);

            // Act
            await bells.hideTrainerBells(trainerA);

            // Assert
            expect((await bellOf(bellA.id)).isActive).toBe(false);
            expect((await bellOf(bellB.id)).isActive).toBe(true);
            const completion = await prisma.notification.findFirstOrThrow({ where: { action: NotificationAction.CREATE, data: { path: ['message'], string_contains: marker } } });
            expect(completion.isActive).toBe(true);
        });

        test("deleting a trainer hides its grading bell too, but not another trainer's bells or the completion bell", async () => {
            // Arrange
            const trainerA = await classicTrainer('A');
            const trainerB = await classicTrainer('B');
            const reminderA = await scheduleRow(trainerA, { status: ReminderScheduleStatus.SENT, sentAt: new Date() });
            const reminderB = await scheduleRow(trainerB, { status: ReminderScheduleStatus.SENT, sentAt: new Date() });
            await bells.notifyReminderSent(reminderA);
            await bells.notifyReminderSent(reminderB);
            // A grading bell carries data.trainerId and action CREATE, as GradingNotificationService writes it.
            const gradingBell = (trainerId: string) => ({
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.CREATE,
                priority: 'MEDIUM',
                data: { kind: 'EXAM_GRADED', trainerId, trainerName: 'Graded', examType: 'fill-in-blank' },
                expiresAt: new Date(Date.now() + DAY_MS),
                isActive: true,
                recipientUserIds: [user.id],
            });
            await notificationService.create(gradingBell(trainerA) as never);
            await notificationService.create(gradingBell(trainerB) as never);
            // The completion bell carries no trainerId, so it is found by its message.
            const marker = randomUUID();
            await notificationService.create({
                type: NotificationType.VOCAB_TRAINER,
                action: NotificationAction.CREATE,
                priority: 'LOW',
                data: { trainerName: 'A', message: `Your test has been completed after 6 passes ${marker}`, completedAt: new Date().toISOString() },
                expiresAt: new Date(Date.now() + DAY_MS),
                isActive: true,
                recipientUserIds: [user.id],
            } as never);

            // Act
            await bells.hideAllTrainerBells(trainerA);

            // Assert
            const gradingOf = async (trainerId: string) =>
                prisma.notification.findFirstOrThrow({ where: { action: NotificationAction.CREATE, data: { path: ['trainerId'], equals: trainerId } } });
            expect((await bellOf(reminderA.id)).isActive).toBe(false);
            expect((await gradingOf(trainerA)).isActive).toBe(false);
            expect((await gradingOf(trainerB)).isActive).toBe(true);
            expect((await bellOf(reminderB.id)).isActive).toBe(true);
            const completion = await prisma.notification.findFirstOrThrow({ where: { action: NotificationAction.CREATE, data: { path: ['message'], string_contains: marker } } });
            expect(completion.isActive).toBe(true);
        });
    });

    describe('bells for a trainer that is gone', () => {
        test('no bell is written, and nothing is pushed, when the trainer was deleted before the bell step', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            const row = await scheduleRow(trainerId, { status: ReminderScheduleStatus.SENT, sentAt: new Date() });
            await prisma.vocabTrainer.delete({ where: { id: trainerId } });

            // Act
            await bells.notifyReminderSent(row);

            // Assert
            expect(await prisma.notification.findMany({ where: { data: { path: ['scheduleId'], equals: row.id } } })).toHaveLength(0);
            expect(gateway.sendToUser).not.toHaveBeenCalled();
        });
    });

    describe('in-flight reminders', () => {
        test.each([
            [ReminderScheduleStatus.PENDING, true],
            [ReminderScheduleStatus.CLAIMED, true],
            [ReminderScheduleStatus.QUEUED, true],
            [ReminderScheduleStatus.SENDING, true],
            [ReminderScheduleStatus.SENT, false],
            [ReminderScheduleStatus.FAILED_TERMINAL, false],
            [ReminderScheduleStatus.CANCELLED, false],
            [ReminderScheduleStatus.EXPIRED, false],
        ])('an INITIAL reminder in %s is in flight: %s (a terminal failure does not block the next attempt)', async (status, inFlight) => {
            // Arrange
            const trainerId = await classicTrainer();
            await scheduleRow(trainerId, { status });

            // Act
            const result = await schedules.hasInFlightInitial(trainerId);

            // Assert
            expect(result).toBe(inFlight);
        });

        test('an escalation alone does not count as an in-flight INITIAL reminder', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            await scheduleRow(trainerId, { reminderType: ReminderScheduleKind.ESCALATION, escalationLevel: 1 });

            // Act + Assert
            expect(await schedules.hasInFlightInitial(trainerId)).toBe(false);
        });
    });

    describe('send guard', () => {
        const guard = () => new ReminderSendGuardService(schedules);

        test('a reminder whose trainer was deleted is not sent', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            const row = await scheduleRow(trainerId);
            await prisma.vocabTrainer.delete({ where: { id: trainerId } });

            // Act + Assert
            expect(await guard().check(row)).toEqual({ send: false, reason: 'trainer_gone' });
        });

        test('a reminder whose trainer turned reminders off is not sent', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            const row = await scheduleRow(trainerId);
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { reminderDisabled: true } });

            // Act + Assert
            expect(await guard().check(row)).toEqual({ send: false, reason: 'reminder_disabled' });
        });

        test('a reminder of a deactivated user is not sent', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            const row = await scheduleRow(trainerId);
            await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

            // Act + Assert
            expect(await guard().check(row)).toEqual({ send: false, reason: 'user_inactive' });
        });

        test('a reminder that still matches is sent', async () => {
            // Arrange
            const trainerId = await classicTrainer();
            const row = await scheduleRow(trainerId);

            // Act + Assert
            expect(await guard().check(row)).toEqual({ send: true });
        });
    });
});
