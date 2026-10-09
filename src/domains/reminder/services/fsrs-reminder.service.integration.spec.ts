import { EmailProcessor } from '@/domains/notification/email/processors/email.processor';
import { ConfigRepository } from '@/domains/platform/config/repositories';
import { ConfigService } from '@/domains/platform/config/services/config.service';
import { FsrsRepository } from '@/domains/vocab/repositories/fsrs.repository';
import { FsrsReviewService } from '@/domains/vocab/services/fsrs-review.service';
import { FsrsSessionService } from '@/domains/vocab/services/fsrs-session.service';
import { FsrsService } from '@/domains/vocab/services/fsrs.service';
import { DEFAULT_SRS_TIMEZONE, startOfLocalDay } from '@/domains/vocab/utils/fsrs-local-day.util';
import { PrismaService } from '@/shared/services/prisma.service';
import { FsrsDirection, ReminderSchedule, ReminderScheduleStatus } from '@prisma/client';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { ActedCheckRegistry } from '../strategies/acted-check.registry';
import { VOCAB_TRAINER_ENTITY, VocabTrainerActedCheckStrategy } from '../strategies/vocab-trainer-acted-check.strategy';
import { FsrsReminderService } from './fsrs-reminder.service';

// Runs against a real Postgres:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test fsrs-reminder
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TEMPLATE = 'fsrs_due_reminder';
// 17:00 on 4 Oct in Asia/Ho_Chi_Minh (the default zone): the review day runs 2026-10-03T21:00Z to 2026-10-04T21:00Z.
const NOW = new Date('2026-10-04T10:00:00.000Z');
const S2T = FsrsDirection.SOURCE_TO_TARGET;
// 09:00 local time on the next review day (5 Oct).
const TOMORROW_MORNING = '2026-10-05T02:00:00.000Z';

const daysFromNow = (days: number): Date => new Date(NOW.getTime() + days * MS_PER_DAY);

describeWithDb('FsrsReminderService (real Postgres)', () => {
    let prisma: PrismaService;
    let service: FsrsReminderService;
    let registry: ActedCheckRegistry;
    let reminders: ReminderScheduleRepository;

    let userId: string;
    let email: string;
    let trainerId: string;
    let folderId: string;
    let wordSeq = 0;

    const addWord = async (textSource: string): Promise<string> => {
        const vocab = await prisma.vocab.create({
            data: {
                textSource,
                sourceLanguageCode: 'en',
                targetLanguageCode: 'vi',
                userId,
                languageFolderId: folderId,
                textTargets: { create: [{ textTarget: `${textSource}-vi` }] },
            },
        });
        await prisma.vocabTrainerWord.create({ data: { vocabTrainerId: trainerId, vocabId: vocab.id, createdAt: new Date(NOW.getTime() - 1000000 + ++wordSeq * 1000) } });

        return vocab.id;
    };

    const newCard = async (textSource: string) => prisma.vocabFsrsCard.create({ data: { vocabTrainerId: trainerId, vocabId: await addWord(textSource), userId, direction: S2T } });

    const reviewCard = async (textSource: string, due: Date) =>
        prisma.vocabFsrsCard.create({
            data: {
                vocabTrainerId: trainerId,
                vocabId: await addWord(textSource),
                userId,
                direction: S2T,
                state: 'REVIEW',
                stability: 10,
                difficulty: 5,
                reps: 3,
                scheduledDays: 5,
                lastReviewedAt: daysFromNow(-1),
                due,
            },
        });

    const reviewLog = async (vocabId: string, reviewedAt: Date, answerId: string) =>
        prisma.vocabFsrsReviewLog.create({
            data: {
                answerId,
                userId,
                vocabId,
                vocabTrainerId: trainerId,
                direction: S2T,
                rating: 'GOOD',
                prevState: 'REVIEW',
                elapsedDays: 1,
                stateAfter: 'REVIEW',
                dueAfter: daysFromNow(3),
                stabilityAfter: 12,
                difficultyAfter: 5,
                scheduledDaysAfter: 3,
                desiredRetentionAtReview: 0.9,
                questionType: 'FLIP_CARD',
                reviewedAt,
            },
        });

    const rowsOf = async (status?: ReminderScheduleStatus) =>
        prisma.reminderSchedule.findMany({ where: { entityId: trainerId, template: TEMPLATE, ...(status ? { status } : {}) }, orderBy: { dueAt: 'asc' } });

    // A reminder that was sent `daysAgo` days before NOW.
    const sentReminder = async (daysAgo: number) =>
        prisma.reminderSchedule.create({
            data: {
                dedupeKey: `vocab-trainer:${trainerId}:fsrs:sent-${daysAgo}`,
                template: TEMPLATE,
                recipient: email,
                payload: { firstName: 'Ada', lastName: 'Lovelace' },
                dueAt: daysFromNow(-daysAgo),
                status: 'SENT',
                sentAt: daysFromNow(-daysAgo),
                entityType: VOCAB_TRAINER_ENTITY,
                entityId: trainerId,
                userId,
            },
        });

    // A pending reminder as the scheduler would pick it up.
    const pendingReminder = async (key: string, dueAt: Date = NOW): Promise<ReminderSchedule> =>
        reminders.createSchedule({
            dedupeKey: `vocab-trainer:${trainerId}:fsrs:${key}`,
            template: TEMPLATE,
            recipient: email,
            payload: { firstName: 'Ada', lastName: 'Lovelace' },
            dueAt,
            entityType: VOCAB_TRAINER_ENTITY,
            entityId: trainerId,
            userId,
        });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        const fsrsRepository = new FsrsRepository(prisma);
        const fsrsService = new FsrsService();
        const configService = new ConfigService(new ConfigRepository(prisma));
        const sessions = new FsrsSessionService(fsrsRepository, fsrsService, new FsrsReviewService(fsrsRepository, fsrsService), configService);
        reminders = new ReminderScheduleRepository(prisma);
        registry = new ActedCheckRegistry(new VocabTrainerActedCheckStrategy(new VocabTrainerRepository(prisma), fsrsRepository));
        registry.onModuleInit();
        const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), log: jest.fn() } as never;
        service = new FsrsReminderService(fsrsRepository, fsrsService, sessions, reminders, registry, configService, logger);
        await prisma.$connect();
    });

    const cleanup = async () => {
        await prisma.reminderSchedule.deleteMany({ where: { recipient: { startsWith: 'fsrs-reminder-spec' } } });
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-reminder-spec' } } });
    };

    afterAll(async () => {
        await cleanup();
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await cleanup();
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        email = `fsrs-reminder-spec-${Date.now()}@example.com`;
        const user = await prisma.user.create({ data: { email, firstName: 'Ada', lastName: 'Lovelace' } });
        userId = user.id;
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        folderId = folder.id;
        const trainer = await prisma.vocabTrainer.create({ data: { name: 'Exam words', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId } });
        trainerId = trainer.id;
        wordSeq = 0;
    });

    describe('sync', () => {
        test('plans the first reminder for tomorrow morning when new words are waiting', async () => {
            // Arrange
            await newCard('hello');

            // Act
            await service.sync(userId, trainerId, NOW);

            // Assert
            const rows = await rowsOf();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                status: 'PENDING',
                recipient: email,
                userId,
                entityType: VOCAB_TRAINER_ENTITY,
                dedupeKey: `vocab-trainer:${trainerId}:fsrs:2026-10-05`,
                payload: { firstName: 'Ada', lastName: 'Lovelace' },
            });
            expect(rows[0]?.dueAt.toISOString()).toBe(TOMORROW_MORNING);
        });

        test('waits for the morning of the day the first card is due when nothing else is waiting', async () => {
            // Arrange
            await reviewCard('later', daysFromNow(5));

            // Act
            await service.sync(userId, trainerId, NOW);

            // Assert
            const [row] = await rowsOf();
            expect(row?.dueAt.toISOString()).toBe('2026-10-09T02:00:00.000Z');
            expect(row?.dedupeKey).toBe(`vocab-trainer:${trainerId}:fsrs:2026-10-09`);
        });

        test('plans tomorrow for a card that is overdue', async () => {
            // Arrange
            await reviewCard('late', daysFromNow(-1));

            // Act
            await service.sync(userId, trainerId, NOW);

            // Assert
            const [row] = await rowsOf();
            expect(row?.dueAt.toISOString()).toBe(TOMORROW_MORNING);
        });

        test('plans nothing when there is nothing left to learn', async () => {
            // Act
            await service.sync(userId, trainerId, NOW);

            // Assert
            expect(await rowsOf()).toHaveLength(0);
        });

        test('keeps one pending reminder when it runs again', async () => {
            // Arrange
            await newCard('hello');

            // Act
            await service.sync(userId, trainerId, NOW);
            await service.sync(userId, trainerId, NOW);

            // Assert
            expect(await rowsOf('PENDING')).toHaveLength(1);
            expect(await rowsOf()).toHaveLength(1);
        });

        test('moves the reminder to the new day when the cards move', async () => {
            // Arrange
            const card = await newCard('hello');
            await service.sync(userId, trainerId, NOW);

            // Act: the word is learned and comes back in 5 days
            await prisma.vocabFsrsCard.update({
                where: { id: card.id },
                data: { state: 'REVIEW', stability: 10, difficulty: 5, reps: 3, scheduledDays: 5, lastReviewedAt: NOW, due: daysFromNow(5) },
            });
            await service.sync(userId, trainerId, NOW);

            // Assert
            const pending = await rowsOf('PENDING');
            expect(pending.map((row) => row.dueAt.toISOString())).toEqual(['2026-10-09T02:00:00.000Z']);
            const cancelled = await rowsOf('CANCELLED');
            expect(cancelled).toHaveLength(1);
            expect(cancelled[0]?.cancelReason).toBe('rescheduled');
        });

        test('cancels the pending reminder once the cycle has ended', async () => {
            // Arrange
            await newCard('hello');
            await service.sync(userId, trainerId, NOW);
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(-1) } });

            // Act
            await service.sync(userId, trainerId, NOW);

            // Assert
            expect(await rowsOf('PENDING')).toHaveLength(0);
            expect(await rowsOf('CANCELLED')).toHaveLength(1);
        });

        test('plans again when the deadline is extended', async () => {
            // Arrange
            await newCard('hello');
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(-1) } });
            await service.sync(userId, trainerId, NOW);
            expect(await rowsOf()).toHaveLength(0);

            // Act
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(30) } });
            await service.sync(userId, trainerId, NOW);

            // Assert
            expect(await rowsOf('PENDING')).toHaveLength(1);
        });

        test('plans nothing when reminders are turned off', async () => {
            // Arrange
            await newCard('hello');
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { reminderDisabled: true } });

            // Act
            await service.sync(userId, trainerId, NOW);

            // Assert
            expect(await rowsOf()).toHaveLength(0);
        });

        test('leaves a Classic trainer alone', async () => {
            // Arrange
            const classic = await prisma.vocabTrainer.create({ data: { name: 'Classic', status: 'PENDING', mode: 'CLASSIC', questionType: 'FLIP_CARD', userId } });

            // Act
            await service.sync(userId, classic.id, NOW);

            // Assert
            expect(await prisma.reminderSchedule.count({ where: { entityId: classic.id } })).toBe(0);
        });

        test('leaves the trainer of someone else alone', async () => {
            // Arrange
            await newCard('hello');

            // Act
            await service.sync('someone-else', trainerId, NOW);

            // Assert
            expect(await rowsOf()).toHaveLength(0);
        });

        describe('after reminders that were not acted on', () => {
            test('plans nothing after 3 reminders in a row that got no review', async () => {
                // Arrange
                await newCard('hello');
                await sentReminder(3);
                await sentReminder(2);
                await sentReminder(1);

                // Act
                await service.sync(userId, trainerId, NOW);

                // Assert
                expect(await rowsOf('PENDING')).toHaveLength(0);
            });

            test('still plans after 2 reminders that got no review', async () => {
                // Arrange
                await newCard('hello');
                await sentReminder(2);
                await sentReminder(1);

                // Act
                await service.sync(userId, trainerId, NOW);

                // Assert
                expect(await rowsOf('PENDING')).toHaveLength(1);
            });

            test('plans again once the user reviews a card', async () => {
                // Arrange
                const card = await newCard('hello');
                await sentReminder(3);
                await sentReminder(2);
                await sentReminder(1);
                await service.sync(userId, trainerId, NOW);
                expect(await rowsOf('PENDING')).toHaveLength(0);

                // Act: a review after the oldest of the three reminders
                await reviewLog(card.vocabId, daysFromNow(-0.5), 'answer-1');
                await service.sync(userId, trainerId, NOW);

                // Assert
                expect(await rowsOf('PENDING')).toHaveLength(1);
            });

            test('does not count a reminder that was skipped because nothing was due', async () => {
                // Arrange
                await newCard('hello');
                await sentReminder(2);
                await sentReminder(1);
                await prisma.reminderSchedule.create({
                    data: {
                        dedupeKey: `vocab-trainer:${trainerId}:fsrs:skipped`,
                        template: TEMPLATE,
                        recipient: email,
                        dueAt: NOW,
                        status: 'CANCELLED',
                        cancelReason: 'nothing_due',
                        entityType: VOCAB_TRAINER_ENTITY,
                        entityId: trainerId,
                        userId,
                    },
                });

                // Act
                await service.sync(userId, trainerId, NOW);

                // Assert
                expect(await rowsOf('PENDING')).toHaveLength(1);
            });
        });
    });

    describe('cancelForTrainer', () => {
        test('cancels the pending reminder and keeps the history', async () => {
            // Arrange
            await newCard('hello');
            await service.sync(userId, trainerId, NOW);
            await sentReminder(1);

            // Act
            await service.cancelForTrainer(trainerId, 'trainer_deleted');

            // Assert
            expect(await rowsOf('PENDING')).toHaveLength(0);
            expect((await rowsOf('CANCELLED'))[0]?.cancelReason).toBe('trainer_deleted');
            expect(await rowsOf('SENT')).toHaveLength(1);
        });
    });

    describe('prepareSend', () => {
        test('counts overdue and due cards together and the new words that may start today', async () => {
            // Arrange
            await reviewCard('overdue-1', daysFromNow(-1.5));
            await reviewCard('overdue-2', daysFromNow(-2));
            await reviewCard('today', daysFromNow(0.2));
            await reviewCard('later', daysFromNow(3));
            await newCard('new-1');
            await newCard('new-2');
            await newCard('new-3');
            const row = await pendingReminder('count');

            // Act
            const result = await service.prepareSend(row, NOW);

            // Assert
            expect(result).toEqual({
                send: true,
                data: {
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    trainerName: 'Exam words',
                    reviewCount: 3,
                    newCount: 3,
                    reviewUrl: expect.stringContaining(`/vocab-trainer/${trainerId}/review`),
                },
            });
        });

        test('offers no more new words than the daily limit', async () => {
            // Arrange
            await newCard('new-1');
            await newCard('new-2');
            await newCard('new-3');
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsNewPerDay: 2 } });
            const row = await pendingReminder('limit');

            // Act
            const result = await service.prepareSend(row, NOW);

            // Assert
            expect(result).toMatchObject({ send: true, data: { reviewCount: 0, newCount: 2 } });
        });

        test('skips the email when nothing is due and no new word is ready', async () => {
            // Arrange
            await reviewCard('later', daysFromNow(3));
            const row = await pendingReminder('empty');

            // Act + Assert
            await expect(service.prepareSend(row, NOW)).resolves.toEqual({ send: false, reason: 'nothing_due' });
        });

        test('skips the email once the cycle has ended', async () => {
            // Arrange
            await reviewCard('late', daysFromNow(-1));
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(-1) } });
            const row = await pendingReminder('ended');

            // Act + Assert
            await expect(service.prepareSend(row, NOW)).resolves.toEqual({ send: false, reason: 'cycle_ended' });
        });

        test('skips the email when reminders were turned off after it was planned', async () => {
            // Arrange
            await reviewCard('late', daysFromNow(-1));
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { reminderDisabled: true } });
            const row = await pendingReminder('off');

            // Act + Assert
            await expect(service.prepareSend(row, NOW)).resolves.toEqual({ send: false, reason: 'reminder_disabled' });
        });

        test('skips the email when the trainer is gone', async () => {
            // Arrange
            const row = await pendingReminder('gone');
            await prisma.vocabTrainer.delete({ where: { id: trainerId } });

            // Act + Assert
            await expect(service.prepareSend(row, NOW)).resolves.toEqual({ send: false, reason: 'trainer_gone' });
        });
    });

    describe('escalation repair', () => {
        test('does not pick up a sent FSRS reminder, which never has escalations', async () => {
            // Arrange
            const sent = await sentReminder(2);
            const exam = await prisma.reminderSchedule.create({
                data: {
                    dedupeKey: `vocab-trainer:${trainerId}:initial:chain-1`,
                    template: 'exam_reminder',
                    recipient: email,
                    dueAt: daysFromNow(-2),
                    status: 'SENT',
                    sentAt: daysFromNow(-2),
                    entityType: VOCAB_TRAINER_ENTITY,
                    entityId: trainerId,
                    userId,
                },
            });

            // Act
            const candidates = await reminders.findInitialSentRemindersBefore(NOW, 50);

            // Assert
            const ids = candidates.map((row) => row.id);
            expect(ids).toContain(exam.id);
            expect(ids).not.toContain(sent.id);
        });
    });

    describe('acted check', () => {
        test('an FSRS trainer acted when a card was reviewed after the given time', async () => {
            // Arrange
            const card = await newCard('hello');
            await reviewLog(card.vocabId, daysFromNow(-1), 'answer-1');

            // Act + Assert
            await expect(registry.hasActedSince(VOCAB_TRAINER_ENTITY, trainerId, daysFromNow(-2))).resolves.toBe(true);
            await expect(registry.hasActedSince(VOCAB_TRAINER_ENTITY, trainerId, NOW)).resolves.toBe(false);
        });

        test('the last exam still decides for a Classic trainer', async () => {
            // Arrange
            const classic = await prisma.vocabTrainer.create({
                data: { name: 'Classic', status: 'PENDING', mode: 'CLASSIC', questionType: 'FLIP_CARD', userId, lastExamSubmittedAt: daysFromNow(-1) },
            });

            // Act + Assert
            await expect(registry.hasActedSince(VOCAB_TRAINER_ENTITY, classic.id, daysFromNow(-2))).resolves.toBe(true);
            await expect(registry.hasActedSince(VOCAB_TRAINER_ENTITY, classic.id, NOW)).resolves.toBe(false);
        });
    });

    describe('the email job', () => {
        let emailService: { sendReminderEmail: jest.Mock };
        let processor: EmailProcessor;

        const run = async (row: ReminderSchedule): Promise<ReminderSchedule | null> => {
            await processor.handleReminderScheduleEmail({ data: { scheduleId: row.id } } as never);

            return reminders.findById(row.id);
        };

        // The job runs with the real clock, so the expectations are computed from the real clock too.
        const morningOf = (day: Date): string => new Date(startOfLocalDay(day, DEFAULT_SRS_TIMEZONE).getTime() + 5 * 60 * 60 * 1000).toISOString();

        beforeEach(() => {
            emailService = { sendReminderEmail: jest.fn().mockResolvedValue(undefined) };
            const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), log: jest.fn() } as never;
            processor = new EmailProcessor(emailService as never, logger, reminders, registry, service);
        });

        test('sends the numbers counted now and plans the next reminder', async () => {
            // Arrange
            await newCard('hello');
            await newCard('world');
            const row = await pendingReminder('job-send');

            // Act
            const done = await run(row);

            // Assert
            expect(done?.status).toBe('SENT');
            expect(emailService.sendReminderEmail).toHaveBeenCalledWith(
                email,
                'Vocab Trainer',
                TEMPLATE,
                expect.objectContaining({ trainerName: 'Exam words', reviewCount: 0, newCount: 2 }),
            );
            const pending = await rowsOf('PENDING');
            expect(pending).toHaveLength(1);
            expect(pending[0]?.dueAt.getTime()).toBeGreaterThan(Date.now());
            expect(pending[0]?.dedupeKey).not.toBe(row.dedupeKey);
        });

        test('sends nothing when there is nothing to do and plans the day the next card is due', async () => {
            // Arrange
            const due = new Date(Date.now() + 10 * MS_PER_DAY);
            await reviewCard('later', due);
            const row = await pendingReminder('job-skip');

            // Act
            const done = await run(row);

            // Assert
            expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
            expect(done).toMatchObject({ status: 'CANCELLED', cancelReason: 'nothing_due' });
            const pending = await rowsOf('PENDING');
            expect(pending.map((item) => item.dueAt.toISOString())).toEqual([morningOf(due)]);
        });

        test('does not plan another reminder after the third one that was ignored', async () => {
            // Arrange
            await newCard('hello');
            await sentReminder(5);
            await sentReminder(4);
            const row = await pendingReminder('job-third');

            // Act
            const done = await run(row);

            // Assert
            expect(done?.status).toBe('SENT');
            expect(emailService.sendReminderEmail).toHaveBeenCalledTimes(1);
            expect(await rowsOf('PENDING')).toHaveLength(0);
        });

        test('keeps a failed send for a retry and plans nothing yet', async () => {
            // Arrange
            await newCard('hello');
            emailService.sendReminderEmail.mockRejectedValue(new Error('provider down'));
            const row = await pendingReminder('job-fail');

            // Act
            const done = await run(row);

            // Assert
            expect(done?.status).toBe('PENDING');
            expect(done?.attempt).toBe(1);
            expect(await rowsOf('PENDING')).toHaveLength(1);
        });
    });
});
