import redisConfig from '@/config/redis.config';
import { RedisKeyManager, RedisPrefix } from '@/shared';
import { PrismaService } from '@/shared/services/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { QuestionType, ReminderScheduleKind, ReminderScheduleStatus, TrainerStatus, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { AiQueueService } from '../../ai/services/ai-queue.service';
import { VocabTrainerJobLockService } from '../../ai/services/vocab-trainer-job-lock.service';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services/vocab-trainer-reminder-after-exam.service';
import { FsrsRepository } from '../../vocab/repositories/fsrs.repository';
import { VocabTrainerRepository } from '../repositories';
import { VocabTrainerAttemptService } from './vocab-trainer-attempt.service';
import { VocabTrainerReminderService } from './vocab-trainer-reminder.service';
import { VocabTrainerService } from './vocab-trainer.service';

// Runs against a real Postgres and a real Redis (the per-user AI job lock):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-trainer.pass-counting.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const { url: redisUrl } = redisConfig();

const DAY_MS = 24 * 60 * 60 * 1000;
const SPEC_EMAIL = 'pass-count-spec';

describeWithDb('Pass counting (real Postgres and Redis)', () => {
    let prisma: PrismaService;
    let redis: Redis;
    let service: VocabTrainerService;
    let lock: VocabTrainerJobLockService;
    let aiQueue: AiQueueService;
    let reminderInApp: { hideTrainerBells: jest.Mock };
    let notifications: { create: jest.Mock };
    let user: User;
    let words: string[];
    let folderId: string;

    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const unused = {} as never;

    const createVocab = async (textSource: string): Promise<string> => {
        const vocab = await prisma.vocab.create({
            data: {
                textSource,
                sourceLanguageCode: 'en',
                targetLanguageCode: 'vi',
                userId: user.id,
                languageFolderId: folderId,
                textTargets: { create: [{ textTarget: `${textSource}-vi` }] },
            },
        });

        return vocab.id;
    };

    /** A submit where every word is answered right (PASSED) or wrong (FAILED). */
    const submitBody = (passed: boolean) => ({
        questionType: QuestionType.MULTIPLE_CHOICE,
        countTime: 30,
        wordTestSelects: words.map((word) => ({ systemSelected: word, userSelected: passed ? word : 'wrong-answer' })),
    });

    const reminderRows = async (trainerId: string) =>
        prisma.reminderSchedule.findMany({ where: { entityType: 'vocab_trainer', entityId: trainerId }, orderBy: { createdAt: 'asc' } });

    const activeInitial = async (trainerId: string) =>
        prisma.reminderSchedule.findFirst({
            where: { entityType: 'vocab_trainer', entityId: trainerId, reminderType: ReminderScheduleKind.INITIAL, status: ReminderScheduleStatus.PENDING },
        });

    /** The reminder of the last counted attempt has been sent, so the next attempt starts a new cycle. */
    const markLastReminderSent = async (trainerId: string) => {
        await prisma.reminderSchedule.updateMany({
            where: { entityType: 'vocab_trainer', entityId: trainerId, reminderType: ReminderScheduleKind.INITIAL, status: ReminderScheduleStatus.PENDING },
            data: { status: ReminderScheduleStatus.SENT, sentAt: new Date() },
        });
    };

    const createClassicTrainer = async (overrides: Record<string, unknown> = {}): Promise<string> => {
        const dto = await service.create(
            { name: `Trainer ${randomUUID()}`, status: TrainerStatus.PENDING, questionType: QuestionType.MULTIPLE_CHOICE, vocabAssignmentIds: words, ...overrides } as never,
            user.id,
        );

        return dto.id;
    };

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        redis = new Redis(redisUrl);
        await prisma.$connect();

        lock = new VocabTrainerJobLockService({ client: redis } as never, logger as never);
        aiQueue = new AiQueueService(unused, unused, unused, unused, lock);
        const reminderSchedules = new ReminderScheduleRepository(prisma);
        const reminderAfterExam = new VocabTrainerReminderAfterExamService();
        const trainerRepository = new VocabTrainerRepository(prisma);
        reminderInApp = { hideTrainerBells: jest.fn().mockResolvedValue(undefined) };
        notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
        const fsrsReminder = { sync: jest.fn().mockResolvedValue(undefined), cancelForTrainer: jest.fn() };
        const attempt = new VocabTrainerAttemptService(trainerRepository, reminderAfterExam, reminderInApp as never, notifications as never, logger as never, reminderSchedules);
        const reminderSettings = new VocabTrainerReminderService(
            trainerRepository,
            reminderAfterExam,
            reminderSchedules,
            reminderInApp as never,
            fsrsReminder as never,
            logger as never,
        );
        const aiService = { getActiveJobForTrainer: async (userId: string, trainerId: string) => aiQueue.getActiveJobForTrainer(userId, trainerId) };
        const mastery = { updateMastery: jest.fn().mockResolvedValue(undefined) };

        service = new VocabTrainerService(
            trainerRepository,
            aiService as never,
            mastery as never,
            logger as never,
            new FsrsRepository(prisma),
            unused,
            fsrsReminder as never,
            attempt,
            reminderSettings,
        );
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
        redis.disconnect();
    });

    afterEach(async () => {
        await redis.del(RedisKeyManager.generateKey(RedisPrefix.LOCK, 'vocab-trainer', 'user', user.id));
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        user = await prisma.user.create({ data: { email: `${SPEC_EMAIL}-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId: user.id, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        folderId = folder.id;
        words = [await createVocab('one'), await createVocab('two'), await createVocab('three')];
    });

    describe('counting an attempt', () => {
        test('two parallel multiple-choice submits count one Pass', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();

            // Act
            await Promise.all([service.submitMultipleChoice(trainerId, submitBody(true) as never, user), service.submitMultipleChoice(trainerId, submitBody(true) as never, user)]);

            // Assert: the second submit is a repeat, so it must not restart the cycle either (one reminder row, nothing cancelled)
            const trainer = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } });
            expect(trainer.reminderRepeat).toBe(1);
            expect(await reminderRows(trainerId)).toHaveLength(1);
        });

        test('a repeat while a reminder is pending does not count, does not move the reminder, but its result is stored', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);
            const pending = await activeInitial(trainerId);

            // Act
            await service.submitMultipleChoice(trainerId, submitBody(false) as never, user);

            // Assert
            const trainer = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } });
            expect(trainer.reminderRepeat).toBe(1);
            expect(trainer.reminderFailStreak).toBe(0);
            expect(await activeInitial(trainerId)).toEqual(pending);
            expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(words.length);
        });

        test('three counted failures in a row raise the prompt, and Yes clears it', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();

            // Act: three cycles, each ended by a sent reminder
            for (let cycle = 0; cycle < 3; cycle += 1) {
                await service.submitMultipleChoice(trainerId, submitBody(false) as never, user);
                await markLastReminderSent(trainerId);
            }
            const prompted = await service.findOne(trainerId, user.id);
            const answered = await service.answerReminderPrompt(trainerId, { continueReminders: true }, user.id);

            // Assert
            expect(prompted.reminderPromptPending).toBe(true);
            expect(answered.reminderPromptPending).toBe(false);
            expect((await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } })).reminderFailStreak).toBe(0);
        });

        test('reaching T completes the trainer: it is removed, its reminders are cancelled and the completion bell shows the real T', async () => {
            // Arrange
            const trainerId = await createClassicTrainer({ reminderMaxRepeat: 3 });
            for (let cycle = 0; cycle < 2; cycle += 1) {
                await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);
                await markLastReminderSent(trainerId);
            }

            // Act
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);

            // Assert
            expect(await prisma.vocabTrainer.findUnique({ where: { id: trainerId } })).toBeNull();
            expect((await reminderRows(trainerId)).every((row) => row.status !== ReminderScheduleStatus.PENDING)).toBe(true);
            expect(notifications.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ message: 'Your test has been completed after 3 passes' }) }),
            );
            expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith(trainerId);
        });

        test('the next reminder is due after the trainer spacing, and says so in its payload', async () => {
            // Arrange
            const trainerId = await createClassicTrainer({ reminderSpacingDays: 5 });
            const before = Date.now();

            // Act
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);

            // Assert
            const initial = await activeInitial(trainerId);
            expect(initial?.dueAt.getTime() ?? 0).toBeGreaterThanOrEqual(before + 5 * DAY_MS - 60_000);
            expect(initial?.dueAt.getTime() ?? 0).toBeLessThanOrEqual(before + 5 * DAY_MS + 60_000);
            expect(initial?.payload).toMatchObject({ repeatDays: '5' });
        });
    });

    describe('AI job lock', () => {
        test('a multiple-choice submit during a running AI job of the same trainer returns 409', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            const held = await lock.acquireOrGetActive(user.id, trainerId, 'fill-in-blank-evaluation', 'fill-in-blank', randomUUID());
            expect(held.acquired).toBe(true);

            // Act
            const attempt = service.submitMultipleChoice(trainerId, submitBody(true) as never, user);

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(ConflictException);
            expect((await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } })).reminderRepeat).toBe(0);
        });
    });

    describe('updating a trainer', () => {
        test('an update does not change the Pass count, the status or the last-remind time', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);
            const before = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } });

            // Act
            await service.update(
                trainerId,
                {
                    name: 'Renamed',
                    questionType: QuestionType.MULTIPLE_CHOICE,
                    status: TrainerStatus.FAILED,
                    reminderRepeat: 9,
                    reminderLastRemind: new Date('2001-01-01'),
                } as never,
                user.id,
            );

            // Assert
            const after = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } });
            expect(after.name).toBe('Renamed');
            expect(after.reminderRepeat).toBe(before.reminderRepeat);
            expect(after.status).toBe(before.status);
            expect(after.reminderLastRemind.getTime()).toBe(before.reminderLastRemind.getTime());
        });

        test('a max passes T below the Passes already earned is rejected and changes nothing', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);
            await markLastReminderSent(trainerId);
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);

            // Act
            const attempt = service.update(trainerId, { name: 'x', questionType: QuestionType.MULTIPLE_CHOICE, reminderMaxRepeat: 1 } as never, user.id);

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
            expect((await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } })).reminderMaxRepeat).toBe(6);
        });

        test('the database rejects spacing and max passes outside their ranges', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();

            // Act + Assert
            await expect(prisma.vocabTrainer.update({ where: { id: trainerId }, data: { reminderSpacingDays: 1 } })).rejects.toThrow();
            await expect(prisma.vocabTrainer.update({ where: { id: trainerId }, data: { reminderMaxRepeat: 21 } })).rejects.toThrow();
        });

        test('turning reminders off cancels the pending reminder; turning them on plans the next one once', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);

            // Act
            await service.update(trainerId, { name: 'x', questionType: QuestionType.MULTIPLE_CHOICE, reminderDisabled: true } as never, user.id);
            const whileOff = await activeInitial(trainerId);
            await service.update(trainerId, { name: 'x', questionType: QuestionType.MULTIPLE_CHOICE, reminderDisabled: false } as never, user.id);
            await service.update(trainerId, { name: 'x', questionType: QuestionType.MULTIPLE_CHOICE, reminderDisabled: false } as never, user.id);

            // Assert
            expect(whileOff).toBeNull();
            const pending = (await reminderRows(trainerId)).filter((row) => row.status === ReminderScheduleStatus.PENDING);
            expect(pending).toHaveLength(1);
            expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith(trainerId);
        });

        test('turning reminders on does not plan a reminder for a trainer with no completed attempt', async () => {
            // Arrange
            const trainerId = await createClassicTrainer({ reminderDisabled: true });

            // Act
            await service.update(trainerId, { name: 'x', questionType: QuestionType.MULTIPLE_CHOICE, reminderDisabled: false } as never, user.id);

            // Assert
            expect(await activeInitial(trainerId)).toBeNull();
        });
    });

    describe('reminder prompt', () => {
        test('with no prompt pending the trainer comes back unchanged', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            const before = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } });

            // Act
            const answered = await service.answerReminderPrompt(trainerId, { continueReminders: false }, user.id);

            // Assert
            expect(answered.reminderDisabled).toBe(before.reminderDisabled);
            expect(answered.reminderPromptPending).toBe(false);
        });

        test('No turns reminders off and cancels the pending one', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            for (let cycle = 0; cycle < 3; cycle += 1) {
                await service.submitMultipleChoice(trainerId, submitBody(false) as never, user);
                await markLastReminderSent(trainerId);
            }
            await service.submitMultipleChoice(trainerId, submitBody(false) as never, user);

            // Act
            const answered = await service.answerReminderPrompt(trainerId, { continueReminders: false }, user.id);

            // Assert
            expect(answered.reminderDisabled).toBe(true);
            expect(answered.reminderPromptPending).toBe(false);
            expect(await activeInitial(trainerId)).toBeNull();
        });

        test('an FSRS trainer is rejected', async () => {
            // Arrange
            const fsrs = await prisma.vocabTrainer.create({
                data: { name: 'FSRS', status: TrainerStatus.PENDING, mode: 'FSRS', questionType: QuestionType.FLIP_CARD, userId: user.id },
            });

            // Act
            const attempt = service.answerReminderPrompt(fsrs.id, { continueReminders: true }, user.id);

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('deleting a trainer', () => {
        test('deleting a trainer cancels its pending reminder and hides its bells', async () => {
            // Arrange
            const trainerId = await createClassicTrainer();
            await service.submitMultipleChoice(trainerId, submitBody(true) as never, user);
            expect(await activeInitial(trainerId)).not.toBeNull();

            // Act
            await service.delete(trainerId, user.id);

            // Assert
            const rows = await reminderRows(trainerId);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every((row) => row.status === ReminderScheduleStatus.CANCELLED)).toBe(true);
            expect(reminderInApp.hideTrainerBells).toHaveBeenCalledWith(trainerId);
        });
    });
});
