import { ConfigRepository } from '@/domains/platform/config/repositories';
import { ConfigService } from '@/domains/platform/config/services/config.service';
import { PrismaService } from '@/shared/services/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FsrsDirection, Prisma } from '@prisma/client';
import { FsrsRepository } from '../repositories/fsrs.repository';
import { FsrsReviewService } from './fsrs-review.service';
import { FsrsSessionService } from './fsrs-session.service';
import { FsrsService } from './fsrs.service';

// Runs against a real Postgres:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test fsrs-session
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 17:00 on 4 Oct in Asia/Ho_Chi_Minh (the default zone): the review day runs 2026-10-03T21:00Z to 2026-10-04T21:00Z.
const NOW = new Date('2026-10-04T10:00:00.000Z');
const S2T = FsrsDirection.SOURCE_TO_TARGET;
const T2S = FsrsDirection.TARGET_TO_SOURCE;

const daysFromNow = (days: number): Date => new Date(NOW.getTime() + days * MS_PER_DAY);

describeWithDb('FsrsSessionService (real Postgres)', () => {
    let prisma: PrismaService;
    let service: FsrsSessionService;

    let userId: string;
    let trainerId: string;
    let folderId: string;
    let wordSeq = 0;

    // A word with one translation, added to the trainer at a fixed time so "order added" is deterministic.
    const addWord = async (textSource: string, textTargets: string[] = [`${textSource}-vi`]): Promise<string> => {
        const vocab = await prisma.vocab.create({
            data: {
                textSource,
                sourceLanguageCode: 'en',
                targetLanguageCode: 'vi',
                userId,
                languageFolderId: folderId,
                textTargets: { create: textTargets.map((textTarget) => ({ textTarget })) },
            },
        });
        await prisma.vocabTrainerWord.create({ data: { vocabTrainerId: trainerId, vocabId: vocab.id, createdAt: new Date(NOW.getTime() - 1000000 + ++wordSeq * 1000) } });

        return vocab.id;
    };

    const addCard = async (vocabId: string, direction: FsrsDirection, data: Partial<Prisma.VocabFsrsCardUncheckedCreateInput> = {}) =>
        prisma.vocabFsrsCard.create({ data: { vocabTrainerId: trainerId, vocabId, userId, direction, ...data } });

    // A REVIEW card last seen `elapsedDays` ago that is due now: the longer ago, the lower the recall probability.
    const reviewCard = async (vocabId: string, direction: FsrsDirection, elapsedDays: number, due: Date = daysFromNow(-0.1)) =>
        addCard(vocabId, direction, { state: 'REVIEW', stability: 10, difficulty: 5, reps: 3, scheduledDays: 5, lastReviewedAt: daysFromNow(-elapsedDays), due });

    const introducedLog = async (vocabId: string, answerId: string, reviewedAt: Date, direction: FsrsDirection = S2T) =>
        prisma.vocabFsrsReviewLog.create({
            data: {
                answerId,
                userId,
                vocabId,
                vocabTrainerId: trainerId,
                direction,
                rating: 'GOOD',
                prevState: 'NEW',
                elapsedDays: 0,
                stateAfter: 'REVIEW',
                dueAfter: daysFromNow(3),
                stabilityAfter: 3,
                difficultyAfter: 5,
                scheduledDaysAfter: 3,
                desiredRetentionAtReview: 0.9,
                questionType: 'FLIP_CARD',
                reviewedAt,
            },
        });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        const fsrsRepository = new FsrsRepository(prisma);
        const fsrsService = new FsrsService();
        service = new FsrsSessionService(fsrsRepository, fsrsService, new FsrsReviewService(fsrsRepository, fsrsService), new ConfigService(new ConfigRepository(prisma)));
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-session-spec' } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-session-spec' } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        const user = await prisma.user.create({ data: { email: `fsrs-session-spec-${Date.now()}@example.com`, firstName: 'A', lastName: 'B' } });
        userId = user.id;
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        folderId = folder.id;
        const trainer = await prisma.vocabTrainer.create({ data: { name: 't', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId } });
        trainerId = trainer.id;
        wordSeq = 0;
    });

    describe('getQueue', () => {
        test('puts due cards first, lowest recall probability first, then new cards in the order the words were added', async () => {
            // Arrange
            const fresh = await addWord('fresh');
            const stale = await addWord('stale');
            const first = await addWord('first');
            const second = await addWord('second');
            const freshCard = await reviewCard(fresh, S2T, 2);
            const staleCard = await reviewCard(stale, S2T, 30);
            const firstNew = await addCard(first, S2T);
            const secondNew = await addCard(second, S2T);

            // Act
            const queue = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            expect(queue.ended).toBe(false);
            expect(queue.items.map((item) => item.cardId)).toEqual([staleCard.id, freshCard.id, firstNew.id, secondNew.id]);
        });

        test('limit caps the whole session and the rest is reported as pending', async () => {
            // Arrange
            for (const word of ['a', 'b', 'c', 'd', 'e']) {
                await reviewCard(await addWord(word), S2T, 5);
            }

            // Act
            const queue = await service.getQueue(userId, trainerId, { limit: 3 }, NOW);

            // Assert
            expect(queue.items).toHaveLength(3);
            expect(queue.dueToday).toBe(5);
            expect(queue.pendingAfterThisSession).toBe(2);
        });

        test('is the same on two calls and an answered card leaves it', async () => {
            // Arrange
            const cards = [];
            for (const word of ['a', 'b', 'c']) {
                cards.push(await reviewCard(await addWord(word), S2T, 5 + cards.length));
            }
            const before = await service.getQueue(userId, trainerId, {}, NOW);
            const again = await service.getQueue(userId, trainerId, {}, NOW);
            const answered = before.items[0];

            // Act
            await service.recordAnswer(userId, trainerId, { cardId: answered.cardId, rating: 'GOOD', questionType: 'FLIP_CARD', answerId: 'a-1' }, NOW);
            const after = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            expect(again.items.map((i) => i.cardId)).toEqual(before.items.map((i) => i.cardId));
            expect(after.items.map((i) => i.cardId)).toEqual(before.items.slice(1).map((i) => i.cardId));
        });

        test('the new-card quota counts only cards introduced today, and null means unlimited', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsNewPerDay: 2 } });
            const introducedToday = await addWord('today');
            const introducedYesterday = await addWord('yesterday');
            await reviewCard(introducedToday, S2T, 0, daysFromNow(3));
            await reviewCard(introducedYesterday, S2T, 1, daysFromNow(3));
            await introducedLog(introducedToday, 'l-today', daysFromNow(-0.1));
            await introducedLog(introducedYesterday, 'l-yesterday', daysFromNow(-1));
            for (const word of ['n1', 'n2', 'n3']) {
                await addCard(await addWord(word), S2T);
            }

            // Act
            const limited = await service.getQueue(userId, trainerId, {}, NOW);
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsNewPerDay: null } });
            const unlimited = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            expect(limited.items.filter((i) => i.isNew)).toHaveLength(1);
            expect(limited.newAvailable).toBe(1);
            expect(unlimited.items.filter((i) => i.isNew)).toHaveLength(3);
        });

        test('ahead pulls in cards due within N days', async () => {
            // Arrange
            const word = await addWord('later');
            const card = await reviewCard(word, S2T, 1, daysFromNow(2));

            // Act
            const today = await service.getQueue(userId, trainerId, { ahead: 0 }, NOW);
            const ahead = await service.getQueue(userId, trainerId, { ahead: 3 }, NOW);

            // Assert
            expect(today.items).toHaveLength(0);
            expect(ahead.items.map((i) => i.cardId)).toEqual([card.id]);
        });

        test('two cards of the same word are not placed next to each other when something else is available', async () => {
            // Arrange
            const hello = await addWord('hello');
            const other = await addWord('other');
            await reviewCard(hello, S2T, 30);
            await reviewCard(hello, T2S, 29);
            await reviewCard(other, S2T, 1);

            // Act
            const queue = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            expect(queue.items.map((i) => i.vocabId)).toEqual([hello, other, hello]);
        });

        test('direction decides which side is the question and which answers are accepted', async () => {
            // Arrange
            const word = await addWord('hello', ['xin chào', 'chào']);
            await addCard(word, S2T);
            await addCard(word, T2S, { due: daysFromNow(5) });
            await prisma.vocabFsrsCard.updateMany({ where: { vocabTrainerId: trainerId, direction: T2S }, data: { due: daysFromNow(-0.1) } });

            // Act
            const queue = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            const sourceToTarget = queue.items.find((i) => i.direction === S2T);
            const targetToSource = queue.items.find((i) => i.direction === T2S);
            expect(sourceToTarget).toMatchObject({ frontText: ['hello'], acceptedAnswers: ['xin chào', 'chào'], frontLanguageCode: 'en', backLanguageCode: 'vi' });
            expect(targetToSource).toMatchObject({ frontText: ['xin chào', 'chào'], acceptedAnswers: ['hello'], frontLanguageCode: 'vi', backLanguageCode: 'en' });
        });

        test('gives the preview of the four buttons', async () => {
            // Arrange
            await addCard(await addWord('hello'), S2T);

            // Act
            const queue = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            const preview = queue.items[0]?.preview;
            expect(Object.keys(preview ?? {})).toEqual(['AGAIN', 'HARD', 'GOOD', 'EASY']);
            expect(preview?.EASY.scheduledDays).toBeGreaterThan(preview?.AGAIN.scheduledDays ?? Infinity);
        });

        test('an ended trainer returns an empty queue and rejects answers', async () => {
            // Arrange
            const card = await reviewCard(await addWord('hello'), S2T, 5);
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(-1) } });

            // Act
            const queue = await service.getQueue(userId, trainerId, {}, NOW);
            const answer = service.recordAnswer(userId, trainerId, { cardId: card.id, rating: 'GOOD', questionType: 'FLIP_CARD', answerId: 'a-ended' }, NOW);

            // Assert
            expect(queue).toMatchObject({ ended: true, items: [], overdue: 0, dueToday: 0, newAvailable: 0 });
            await expect(answer).rejects.toThrow('CycleEnded');
        });

        test('uses the timezone from the user config for the end of the day', async () => {
            // Arrange: due 20:00Z is before the end of the day in Ho Chi Minh (21:00Z) but after it in Los Angeles (11:00Z)
            await reviewCard(await addWord('hello'), S2T, 5, new Date('2026-10-04T20:00:00.000Z'));
            const withDefaultZone = await service.getQueue(userId, trainerId, {}, NOW);
            await prisma.config.create({ data: { scope: 'USER', userId, key: 'srs.timezone', value: 'America/Los_Angeles' } });

            // Act
            const withUserZone = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            expect(withDefaultZone.items).toHaveLength(1);
            expect(withUserZone.items).toHaveLength(0);
        });

        test('rejects a Classic trainer and a trainer of another user', async () => {
            // Arrange
            const classic = await prisma.vocabTrainer.create({ data: { name: 'c', status: 'PENDING', questionType: 'MULTIPLE_CHOICE', userId } });
            const other = await prisma.user.create({ data: { email: `fsrs-session-spec-other-${Date.now()}@example.com`, firstName: 'C', lastName: 'D' } });

            // Act + Assert
            await expect(service.getQueue(userId, classic.id, {}, NOW)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.getQueue(other.id, trainerId, {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('direction choices', () => {
        test('a Random card is shown in one of the two directions, with the sides of that direction', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsDirections: [FsrsDirection.RANDOM] } });
            const word = await addWord('apple', ['quả táo']);
            await addCard(word, FsrsDirection.RANDOM);

            // Act
            const queue = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            const [item] = queue.items;
            expect([S2T, T2S]).toContain(item?.direction);
            expect(item?.frontText).toEqual(item?.direction === S2T ? ['apple'] : ['quả táo']);
        });

        test('checkAnswer accepts the answer of the direction the card is shown in', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsDirections: [FsrsDirection.RANDOM] } });
            const word = await addWord('apple', ['quả táo']);
            await addCard(word, FsrsDirection.RANDOM);
            const [item] = (await service.getQueue(userId, trainerId, {}, NOW)).items;

            // Act
            const check = await service.checkAnswer(userId, trainerId, { cardId: item?.cardId ?? '', answer: item?.acceptedAnswers[0] ?? '' });

            // Assert
            expect(check.suggestedRating).toBe('GOOD');
        });

        test('the shown direction is the same on two calls the same day', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsDirections: [FsrsDirection.RANDOM] } });
            await addCard(await addWord('apple', ['quả táo']), FsrsDirection.RANDOM);

            // Act
            const first = await service.getQueue(userId, trainerId, {}, NOW);
            const second = await service.getQueue(userId, trainerId, {}, NOW);

            // Assert
            expect(second.items.map((i) => i.direction)).toEqual(first.items.map((i) => i.direction));
        });

        test('a Random trainer has one card per word: 10 words give 10 cards', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsNewPerDay: null, fsrsDirections: [FsrsDirection.RANDOM] } });
            for (let i = 1; i <= 10; i++) {
                await addCard(await addWord(`r${i}`), FsrsDirection.RANDOM);
            }

            // Act
            const queue = await service.getQueue(userId, trainerId, { limit: 20 }, NOW);

            // Assert
            expect(queue.items).toHaveLength(10);
        });

        test('a trainer with both directions asks 20 cards for 10 words', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsNewPerDay: null } });
            for (let i = 1; i <= 10; i++) {
                const word = await addWord(`b${i}`);
                await addCard(word, S2T);
                await addCard(word, T2S);
            }

            // Act
            const queue = await service.getQueue(userId, trainerId, { limit: 20 }, NOW);

            // Assert
            expect(queue.items).toHaveLength(20);
        });
    });

    describe('getSummary', () => {
        test('counts overdue, due today, new, mastered and leech cards', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsNewPerDay: 5 } });
            await reviewCard(await addWord('overdue'), S2T, 5, daysFromNow(-3));
            await reviewCard(await addWord('today'), S2T, 5, daysFromNow(-0.1));
            await addCard(await addWord('new'), S2T);
            const mastered = await addWord('mastered');
            await addCard(mastered, S2T, { state: 'REVIEW', stability: 250, difficulty: 3, reps: 9, scheduledDays: 200, lastReviewedAt: daysFromNow(-10), due: daysFromNow(150) });
            const leech = await addWord('leech');
            await addCard(leech, S2T, {
                state: 'REVIEW',
                stability: 4,
                difficulty: 9,
                reps: 20,
                lapses: 8,
                scheduledDays: 3,
                lastReviewedAt: daysFromNow(-1),
                due: daysFromNow(2),
            });

            // Act
            const summary = await service.getSummary(userId, trainerId, NOW);

            // Assert
            expect(summary).toMatchObject({ overdue: 1, dueToday: 1, newAvailable: 1, mastered: 1, leech: 1, ended: false, endsAt: null });
            expect(summary.estimatedDaysToClearBacklog).toBe(1);
        });

        test('a card with a recent lapse is not mastered even with a high stability', async () => {
            // Arrange
            const word = await addWord('lapsed');
            await addCard(word, S2T, {
                state: 'REVIEW',
                stability: 250,
                difficulty: 3,
                reps: 9,
                lapses: 1,
                scheduledDays: 200,
                lastReviewedAt: daysFromNow(-10),
                due: daysFromNow(150),
            });
            await prisma.vocabFsrsReviewLog.create({
                data: {
                    answerId: 'lapse-1',
                    userId,
                    vocabId: word,
                    vocabTrainerId: trainerId,
                    direction: S2T,
                    rating: 'AGAIN',
                    prevState: 'REVIEW',
                    elapsedDays: 30,
                    stateAfter: 'REVIEW',
                    dueAfter: daysFromNow(150),
                    stabilityAfter: 250,
                    difficultyAfter: 3,
                    scheduledDaysAfter: 200,
                    desiredRetentionAtReview: 0.9,
                    questionType: 'FLIP_CARD',
                    reviewedAt: daysFromNow(-10),
                },
            });

            // Act
            const summary = await service.getSummary(userId, trainerId, NOW);

            // Assert
            expect(summary.mastered).toBe(0);
        });

        test('an ended trainer has nothing due', async () => {
            // Arrange
            await reviewCard(await addWord('overdue'), S2T, 5, daysFromNow(-3));
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(-1) } });

            // Act
            const summary = await service.getSummary(userId, trainerId, NOW);

            // Assert
            expect(summary).toMatchObject({ ended: true, overdue: 0, dueToday: 0, newAvailable: 0 });
            expect(summary.endsAt?.getTime()).toBe(daysFromNow(-1).getTime());
        });
    });

    describe('checkAnswer', () => {
        test('suggests a rating in both directions and for words with several translations', async () => {
            // Arrange
            const word = await addWord('hello', ['xin chào', 'chào']);
            const sourceToTarget = await addCard(word, S2T);
            const targetToSource = await addCard(word, T2S);

            // Act
            const exact = await service.checkAnswer(userId, trainerId, { cardId: sourceToTarget.id, answer: 'Chào' });
            const typo = await service.checkAnswer(userId, trainerId, { cardId: sourceToTarget.id, answer: 'xin chaò' });
            const wrong = await service.checkAnswer(userId, trainerId, { cardId: sourceToTarget.id, answer: 'tạm biệt' });
            const reverse = await service.checkAnswer(userId, trainerId, { cardId: targetToSource.id, answer: 'helo' });

            // Assert
            expect(exact.suggestedRating).toBe('GOOD');
            expect(typo.suggestedRating).toBe('HARD');
            expect(wrong.suggestedRating).toBe('AGAIN');
            expect(reverse).toMatchObject({ suggestedRating: 'HARD', correctAnswers: ['hello'] });
        });

        test('does not check a card of another trainer', async () => {
            // Arrange
            const otherTrainer = await prisma.vocabTrainer.create({ data: { name: 'o', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId } });

            // Act
            const attempt = service.checkAnswer(userId, otherTrainer.id, { cardId: (await addCard(await addWord('hello'), S2T)).id, answer: 'x' });

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('recordAnswer', () => {
        test('marks an answer on a card pulled in by ahead as ahead', async () => {
            // Arrange
            const card = await reviewCard(await addWord('later'), S2T, 1, daysFromNow(2));

            // Act
            await service.recordAnswer(userId, trainerId, { cardId: card.id, rating: 'GOOD', questionType: 'FLIP_CARD', answerId: 'ahead-1' }, NOW);

            // Assert
            const log = await prisma.vocabFsrsReviewLog.findUniqueOrThrow({ where: { answerId: 'ahead-1' } });
            expect(log.isAhead).toBe(true);
        });

        test('does not record an answer for a card of another trainer', async () => {
            // Arrange
            const otherTrainer = await prisma.vocabTrainer.create({ data: { name: 'o', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId } });
            const card = await addCard(await addWord('hello'), S2T);

            // Act
            const attempt = service.recordAnswer(userId, otherTrainer.id, { cardId: card.id, rating: 'GOOD', questionType: 'FLIP_CARD', answerId: 'x-1' }, NOW);

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
            expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
        });
    });
});
