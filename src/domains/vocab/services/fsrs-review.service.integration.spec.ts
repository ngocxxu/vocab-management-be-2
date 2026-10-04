import { PrismaService } from '@/shared/services/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FsrsDirection } from '@prisma/client';
import { FsrsRepository } from '../repositories/fsrs.repository';
import { FsrsReviewService } from './fsrs-review.service';
import { FsrsService } from './fsrs.service';

// Runs against a real Postgres (row locks and unique keys cannot be mocked):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test fsrs-review
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describeWithDb('FsrsReviewService (real Postgres)', () => {
    // Built in beforeAll: the body of a skipped describe still runs, and there is no database URL then.
    let prisma: PrismaService;
    let service: FsrsReviewService;

    let userId: string;
    let otherUserId: string;
    let trainerId: string;
    let vocabId: string;
    let cardId: string;
    let answerSeq = 0;

    const answer = (overrides: Partial<Parameters<FsrsReviewService['recordReview']>[1]> = {}) => ({
        cardId,
        rating: 'GOOD' as const,
        questionType: 'FLIP_CARD' as const,
        answerId: `answer-${++answerSeq}`,
        ...overrides,
    });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        service = new FsrsReviewService(new FsrsRepository(prisma), new FsrsService());
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-review-spec' } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        const user = await prisma.user.create({ data: { email: `fsrs-review-spec-${Date.now()}@example.com`, firstName: 'A', lastName: 'B' } });
        const other = await prisma.user.create({ data: { email: `fsrs-review-spec-other-${Date.now()}@example.com`, firstName: 'C', lastName: 'D' } });
        userId = user.id;
        otherUserId = other.id;

        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        const vocab = await prisma.vocab.create({
            data: { textSource: 'hello', sourceLanguageCode: 'en', targetLanguageCode: 'vi', userId, languageFolderId: folder.id },
        });
        vocabId = vocab.id;

        const trainer = await prisma.vocabTrainer.create({
            data: { name: 't', status: 'PENDING', mode: 'FSRS', questionType: 'FLIP_CARD', userId, vocabAssignments: { create: [{ vocabId }] } },
        });
        trainerId = trainer.id;

        const card = await prisma.vocabFsrsCard.create({ data: { vocabTrainerId: trainerId, vocabId, userId, direction: FsrsDirection.SOURCE_TO_TARGET } });
        cardId = card.id;
    });

    test('updates the card and writes exactly one log row', async () => {
        // Arrange
        const now = new Date();

        // Act
        const result = await service.recordReview(userId, answer({ durationMs: 1200 }), now);

        // Assert
        const card = await prisma.vocabFsrsCard.findUniqueOrThrow({ where: { id: cardId } });
        const logs = await prisma.vocabFsrsReviewLog.findMany({ where: { vocabTrainerId: trainerId } });
        expect(card.state).toBe('REVIEW');
        expect(card.reps).toBe(1);
        expect(card.lastReviewedAt?.getTime()).toBe(now.getTime());
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            vocabId,
            direction: 'SOURCE_TO_TARGET',
            rating: 'GOOD',
            prevState: 'NEW',
            stateAfter: 'REVIEW',
            desiredRetentionAtReview: 0.9,
            durationMs: 1200,
            questionType: 'FLIP_CARD',
            isAhead: false,
        });
        expect(logs[0]?.reviewedAt.getTime()).toBe(now.getTime());
        expect(result).toMatchObject({ cardId, state: 'REVIEW', isDuplicate: false });
        expect(result.due.getTime()).toBe(card.due.getTime());
    });

    test('a repeated answerId does not schedule twice and returns the first result', async () => {
        // Arrange
        const first = answer();
        const firstResult = await service.recordReview(userId, first, new Date());
        const cardAfterFirst = await prisma.vocabFsrsCard.findUniqueOrThrow({ where: { id: cardId } });

        // Act
        const repeated = await service.recordReview(userId, { ...first, rating: 'AGAIN' }, new Date(Date.now() + 5 * MS_PER_DAY));

        // Assert
        const cardAfterRepeat = await prisma.vocabFsrsCard.findUniqueOrThrow({ where: { id: cardId } });
        expect(cardAfterRepeat).toEqual(cardAfterFirst);
        expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId } })).toBe(1);
        expect(repeated).toMatchObject({ isDuplicate: true, rating: 'GOOD', state: firstResult.state });
        expect(repeated.due.getTime()).toBe(firstResult.due.getTime());
    });

    test('concurrent answers on one card are applied one after another, none is lost', async () => {
        // Arrange
        const now = new Date();

        // Act
        await Promise.all(Array.from({ length: 5 }, async () => service.recordReview(userId, answer(), now)));

        // Assert
        const card = await prisma.vocabFsrsCard.findUniqueOrThrow({ where: { id: cardId } });
        expect(card.reps).toBe(5);
        expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId } })).toBe(5);
    });

    test('concurrent requests with the same answerId schedule once', async () => {
        // Arrange
        const same = answer();

        // Act
        const results = await Promise.all(Array.from({ length: 4 }, async () => service.recordReview(userId, same, new Date())));

        // Assert
        const card = await prisma.vocabFsrsCard.findUniqueOrThrow({ where: { id: cardId } });
        expect(card.reps).toBe(1);
        expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId } })).toBe(1);
        expect(results.filter((r) => !r.isDuplicate)).toHaveLength(1);
    });

    test('marks a review done before the due time as ahead', async () => {
        // Arrange
        const now = new Date();
        await service.recordReview(userId, answer(), now);

        // Act
        await service.recordReview(userId, answer(), new Date(now.getTime() + 60 * 1000));

        // Assert
        const logs = await prisma.vocabFsrsReviewLog.findMany({ where: { vocabTrainerId: trainerId }, orderBy: { reviewedAt: 'asc' } });
        expect(logs.map((l) => l.isAhead)).toEqual([false, true]);
    });

    test('rejects with 409 once the cycle has ended and leaves the card alone', async () => {
        // Arrange
        const now = new Date();
        await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: new Date(now.getTime() - 1000) } });

        // Act
        const attempt = service.recordReview(userId, answer(), now);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow('CycleEnded');
        expect((await prisma.vocabFsrsCard.findUniqueOrThrow({ where: { id: cardId } })).reps).toBe(0);
        expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
    });

    test('caps the interval below the cycle deadline', async () => {
        // Arrange
        const now = new Date();
        const endsAt = new Date(now.getTime() + 10 * MS_PER_DAY);
        await prisma.vocabTrainer.update({ where: { id: trainerId }, data: { fsrsEndsAt: endsAt } });

        // Act
        const result = await service.recordReview(userId, answer({ rating: 'EASY' }), now);

        // Assert
        expect(result.due.getTime()).toBeLessThan(endsAt.getTime());
    });

    test('does not let another user review the card', async () => {
        // Act
        const attempt = service.recordReview(otherUserId, answer(), new Date());

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
        expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
    });

    test('does not touch VocabMastery', async () => {
        // Act
        await service.recordReview(userId, answer(), new Date());

        // Assert
        expect(await prisma.vocabMastery.count({ where: { userId } })).toBe(0);
    });
});
