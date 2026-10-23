import { ConfigRepository } from '@/domains/platform/config/repositories';
import { ConfigService } from '@/domains/platform/config/services/config.service';
import { PrismaService } from '@/shared/services/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FsrsDirection, FsrsRating, FsrsState, Prisma } from '@prisma/client';
import { FsrsRepository } from '../repositories/fsrs.repository';
import { VocabMasteryRepository } from '../repositories/vocab-mastery.repository';
import { FsrsStatsService } from './fsrs-stats.service';
import { FsrsService } from './fsrs.service';
import { VocabMasteryService } from './vocab-mastery.service';

// Runs against a real Postgres:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test fsrs-stats
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 17:00 on 4 Oct in Asia/Ho_Chi_Minh (the default zone): the review day runs 2026-10-03T21:00Z to 2026-10-04T21:00Z.
const NOW = new Date('2026-10-04T10:00:00.000Z');
const S2T = FsrsDirection.SOURCE_TO_TARGET;
const T2S = FsrsDirection.TARGET_TO_SOURCE;

const daysFromNow = (days: number): Date => new Date(NOW.getTime() + days * MS_PER_DAY);

describeWithDb('FSRS statistics (real Postgres)', () => {
    let prisma: PrismaService;
    let stats: FsrsStatsService;
    let masteryRepository: VocabMasteryRepository;

    let userId: string;
    let trainerId: string;
    let folderId: string;
    let answerSeq = 0;

    const addWord = async (textSource: string, trainer: string = trainerId): Promise<string> => {
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
        await prisma.vocabTrainerWord.create({ data: { vocabTrainerId: trainer, vocabId: vocab.id, createdAt: new Date(NOW.getTime() - 1000000) } });

        return vocab.id;
    };

    const addCard = async (vocabId: string, direction: FsrsDirection, data: Partial<Prisma.VocabFsrsCardUncheckedCreateInput> = {}, trainer: string = trainerId) =>
        prisma.vocabFsrsCard.create({ data: { vocabTrainerId: trainer, vocabId, userId, direction, ...data } });

    const reviewCard = async (vocabId: string, direction: FsrsDirection, stability: number, due: Date, lapses = 0, trainer: string = trainerId) =>
        addCard(vocabId, direction, { state: 'REVIEW', stability, difficulty: 5, reps: 5, lapses, scheduledDays: 5, lastReviewedAt: daysFromNow(-5), due }, trainer);

    const addLog = async (vocabId: string, direction: FsrsDirection, rating: FsrsRating, prevState: FsrsState, reviewedAt: Date, trainer: string = trainerId) =>
        prisma.vocabFsrsReviewLog.create({
            data: {
                answerId: `stats-${++answerSeq}`,
                userId,
                vocabId,
                vocabTrainerId: trainer,
                direction,
                rating,
                prevState,
                elapsedDays: 1,
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
        stats = new FsrsStatsService(new FsrsRepository(prisma), new FsrsService(), new ConfigService(new ConfigRepository(prisma)));
        masteryRepository = new VocabMasteryRepository(prisma);
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-stats-spec' } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-stats-spec' } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        const user = await prisma.user.create({ data: { email: `fsrs-stats-spec-${Date.now()}@example.com`, firstName: 'A', lastName: 'B' } });
        userId = user.id;
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        folderId = folder.id;
        const trainer = await prisma.vocabTrainer.create({ data: { name: 't', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId } });
        trainerId = trainer.id;
    });

    describe('getTrainerStats', () => {
        // w1: S2T is mastered, T2S had a lapse recently. w2: S2T is a leech, T2S is new. w3: both are due.
        const buildFixture = async () => {
            const w1 = await addWord('w1');
            const w2 = await addWord('w2');
            const w3 = await addWord('w3');
            await reviewCard(w1, S2T, 250, daysFromNow(150));
            await reviewCard(w1, T2S, 250, daysFromNow(150));
            await reviewCard(w2, S2T, 4, daysFromNow(2), 9);
            await addCard(w2, T2S);
            await reviewCard(w3, S2T, 20, daysFromNow(-3));
            await reviewCard(w3, T2S, 0.5, daysFromNow(0.1));

            await addLog(w1, T2S, 'AGAIN', 'REVIEW', daysFromNow(-10));
            await addLog(w3, S2T, 'GOOD', 'REVIEW', daysFromNow(-5));
            await addLog(w3, S2T, 'GOOD', 'REVIEW', daysFromNow(-4));
            await addLog(w3, S2T, 'EASY', 'REVIEW', daysFromNow(-3));
            await addLog(w3, S2T, 'AGAIN', 'NEW', daysFromNow(-2));
            await addLog(w3, S2T, 'AGAIN', 'REVIEW', daysFromNow(-40));

            return { w1, w2, w3 };
        };

        test('counts cards by state, mastered and leeches, in total and per direction', async () => {
            // Arrange
            await buildFixture();

            // Act
            const result = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(result).toMatchObject({ ended: false, cardsByState: { new: 1, review: 5 }, mastered: 1, leeches: 1 });
            expect(result.byDirection).toEqual([
                { direction: S2T, cards: 3, new: 0, review: 3, mastered: 1, leeches: 1 },
                { direction: T2S, cards: 3, new: 1, review: 2, mastered: 0, leeches: 0 },
            ]);
        });

        test('a Random trainer shows its cards in one RANDOM row', async () => {
            // Arrange
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsDirections: [FsrsDirection.RANDOM] } });
            const w1 = await addWord('w1');
            const w2 = await addWord('w2');
            await reviewCard(w1, FsrsDirection.RANDOM, 4, daysFromNow(2));
            await addCard(w2, FsrsDirection.RANDOM);

            // Act
            const result = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(result.byDirection).toEqual([{ direction: FsrsDirection.RANDOM, cards: 2, new: 1, review: 1, mastered: 0, leeches: 0 }]);
        });

        test('forecasts the cards due in the next 30 days, overdue cards count on day one', async () => {
            // Arrange
            await buildFixture();

            // Act
            const { forecast } = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(forecast).toHaveLength(30);
            expect(forecast[0]).toEqual({ date: '2026-10-04', count: 2 });
            expect(forecast[1]).toEqual({ date: '2026-10-05', count: 0 });
            expect(forecast[2]).toEqual({ date: '2026-10-06', count: 1 });
            expect(forecast.reduce((sum, day) => sum + day.count, 0)).toBe(3);
            expect(forecast[29]?.date).toBe('2026-11-02');
        });

        test('true retention is the share of reviews of known cards that were not Again, last 30 days only', async () => {
            // Arrange
            await buildFixture();

            // Act
            const { trueRetention } = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(trueRetention).toEqual({ value: 0.75, reviews: 4, windowDays: 30 });
        });

        test('true retention is null when there was no review', async () => {
            // Act
            const { trueRetention } = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(trueRetention).toEqual({ value: null, reviews: 0, windowDays: 30 });
        });

        test('groups the review cards by stability', async () => {
            // Arrange
            await buildFixture();

            // Act
            const { stabilityBuckets } = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(stabilityBuckets.map((b) => [b.label, b.count])).toEqual([
                ['<1d', 1],
                ['1-7d', 1],
                ['7-30d', 1],
                ['30-90d', 0],
                ['90-180d', 0],
                ['180d+', 2],
            ]);
        });

        test('lists the leeches with their word', async () => {
            // Arrange
            const { w2 } = await buildFixture();

            // Act
            const { leechCards } = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(leechCards).toEqual([expect.objectContaining({ vocabId: w2, direction: S2T, textSource: 'w2', lapses: 9 })]);
        });

        test('an ended trainer keeps its numbers but has no forecast', async () => {
            // Arrange
            await buildFixture();
            await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: daysFromNow(-1) } });

            // Act
            const result = await stats.getTrainerStats(userId, trainerId, NOW);

            // Assert
            expect(result).toMatchObject({ ended: true, forecast: [], mastered: 1, leeches: 1 });
        });

        test('rejects a Classic trainer and a trainer of another user', async () => {
            // Arrange
            const classic = await prisma.vocabTrainer.create({ data: { name: 'c', status: 'PENDING', questionType: 'MULTIPLE_CHOICE', userId } });

            // Act + Assert
            await expect(stats.getTrainerStats(userId, classic.id, NOW)).rejects.toBeInstanceOf(BadRequestException);
            await expect(stats.getTrainerStats('someone-else', trainerId, NOW)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('getUserSummary', () => {
        test('adds up the cards due today and the mastered cards of every trainer of the user', async () => {
            // Arrange
            const active = await addWord('active');
            await reviewCard(active, S2T, 10, daysFromNow(-1));
            await reviewCard(active, T2S, 10, daysFromNow(0.1));
            await reviewCard(await addWord('later'), S2T, 10, daysFromNow(3));
            await reviewCard(await addWord('mastered'), S2T, 250, daysFromNow(150));

            const endedTrainer = await prisma.vocabTrainer.create({
                data: { name: 'ended', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId, fsrsEndsAt: daysFromNow(-1) },
            });
            const endedWord = await addWord('ended-word', endedTrainer.id);
            await reviewCard(endedWord, S2T, 10, daysFromNow(-1), 0, endedTrainer.id);
            await reviewCard(endedWord, T2S, 250, daysFromNow(150), 0, endedTrainer.id);

            // Act
            const summary = await stats.getUserSummary(userId, NOW);

            // Assert
            expect(summary).toEqual({ fsrsDueToday: 2, fsrsMastered: 2 });
        });

        test('is zero for a user without FSRS trainers', async () => {
            // Act
            const summary = await stats.getUserSummary(userId, NOW);

            // Assert
            expect(summary).toEqual({ fsrsDueToday: 0, fsrsMastered: 0 });
        });

        test('shows up in the dashboard summary', async () => {
            // Arrange
            await reviewCard(await addWord('due'), S2T, 10, daysFromNow(-1));
            const masteryService = new VocabMasteryService(masteryRepository, { countByUserId: jest.fn().mockResolvedValue(0) } as never, stats);

            // Act
            const summary = await masteryService.getSummary(userId);

            // Assert
            expect(summary).toMatchObject({ fsrsDueToday: 1, fsrsMastered: 0 });
        });
    });

    describe('heatmap (getProgressOverTimeRaw)', () => {
        const at = (day: string): Date => new Date(`${day}T12:00:00.000Z`);

        const addMasteryHistory = async (vocabId: string, scores: Array<{ day: string; score: number }>) => {
            const mastery = await prisma.vocabMastery.create({ data: { vocabId, userId, masteryScore: 0 } });
            for (const { day, score } of scores) {
                await prisma.vocabMasteryHistory.create({ data: { vocabMasteryId: mastery.id, masteryScore: score, correctCount: 1, incorrectCount: 0, createdAt: at(day) } });
            }
        };

        test('adds the review logs of each day to the practice count; the mastery average is Classic only, null on a day without Classic practice', async () => {
            // Arrange
            const word = await addWord('word');
            await addMasteryHistory(word, [
                { day: '2026-09-01', score: 4 },
                { day: '2026-09-01', score: 6 },
                { day: '2026-09-03', score: 7 },
            ]);
            for (const day of ['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-02', '2026-09-02', '2026-09-04']) {
                await addLog(word, S2T, 'GOOD', 'REVIEW', at(day));
            }

            // Act
            const rows = await masteryRepository.getProgressOverTimeRaw(userId);

            // Assert
            expect(rows).toEqual([
                { date: '2026-09-01', averageMastery: 5, practiceCount: 5 },
                { date: '2026-09-02', averageMastery: null, practiceCount: 2 },
                { date: '2026-09-03', averageMastery: 7, practiceCount: 1 },
                { date: '2026-09-04', averageMastery: null, practiceCount: 1 },
            ]);
        });

        test('a user without FSRS logs gets exactly what Classic gave before', async () => {
            // Arrange
            const word = await addWord('word');
            await addMasteryHistory(word, [
                { day: '2026-09-01', score: 4 },
                { day: '2026-09-03', score: 8 },
            ]);

            // Act
            const rows = await masteryRepository.getProgressOverTimeRaw(userId);

            // Assert
            expect(rows).toEqual([
                { date: '2026-09-01', averageMastery: 4, practiceCount: 1 },
                { date: '2026-09-03', averageMastery: 8, practiceCount: 1 },
            ]);
        });

        test('the date range applies to the review logs too, and the logs of other users are left out', async () => {
            // Arrange
            const word = await addWord('word');
            await addLog(word, S2T, 'GOOD', 'REVIEW', at('2026-09-01'));
            await addLog(word, S2T, 'GOOD', 'REVIEW', at('2026-09-05'));
            const other = await prisma.user.create({ data: { email: `fsrs-stats-spec-other-${Date.now()}@example.com`, firstName: 'C', lastName: 'D' } });

            // Act
            const rows = await masteryRepository.getProgressOverTimeRaw(userId, '2026-09-02', '2026-09-30');
            const otherRows = await masteryRepository.getProgressOverTimeRaw(other.id);

            // Assert
            expect(rows.map((r) => [r.date, r.practiceCount])).toEqual([['2026-09-05', 1]]);
            expect(otherRows).toEqual([]);
        });
    });
});
