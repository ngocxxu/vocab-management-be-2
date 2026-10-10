import { ConfigRepository } from '@/domains/platform/config/repositories';
import { ConfigService } from '@/domains/platform/config/services/config.service';
import { PrismaService } from '@/shared/services/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionType, TrainerStatus, User } from '@prisma/client';
import { FsrsRepository } from '../../vocab/repositories/fsrs.repository';
import { VocabTrainerInput } from '../dto';
import { VocabTrainerNotFoundException, VocabTrainerWordNotFoundException } from '../exceptions';
import { VocabTrainerRepository } from '../repositories';
import { FsrsDefaultsService } from './fsrs-defaults.service';
import { VocabTrainerService } from './vocab-trainer.service';

// Runs against a real Postgres (cascades and composite keys cannot be mocked):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-trainer.service.fsrs
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb('VocabTrainerService FSRS enrollment (real Postgres)', () => {
    // Built in beforeAll: the body of a skipped describe still runs, and there is no database URL then.
    let prisma: PrismaService;
    let service: VocabTrainerService;
    let defaults: FsrsDefaultsService;

    let user: User;
    let folderId: string;
    let words: string[];
    let wordWithoutTranslation: string;
    const reminders = { sync: jest.fn(), cancelForTrainer: jest.fn() };

    const input = (overrides: Partial<VocabTrainerInput> = {}): VocabTrainerInput =>
        ({
            name: 'FSRS trainer',
            status: TrainerStatus.PENDING,
            questionType: QuestionType.FLIP_CARD,
            mode: 'FSRS',
            vocabAssignmentIds: words,
            ...overrides,
        }) as VocabTrainerInput;

    const cardsOf = async (trainerId: string) => prisma.vocabFsrsCard.findMany({ where: { vocabTrainerId: trainerId }, orderBy: [{ vocabId: 'asc' }, { direction: 'asc' }] });

    const createVocab = async (textSource: string, withTranslation: boolean): Promise<string> => {
        const vocab = await prisma.vocab.create({
            data: {
                textSource,
                sourceLanguageCode: 'en',
                targetLanguageCode: 'vi',
                userId: user.id,
                languageFolderId: folderId,
                ...(withTranslation ? { textTargets: { create: [{ textTarget: `${textSource}-vi` }] } } : {}),
            },
        });

        return vocab.id;
    };

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        const unused = {} as never;
        defaults = new FsrsDefaultsService(new ConfigService(new ConfigRepository(prisma)));
        service = new VocabTrainerService(new VocabTrainerRepository(prisma), unused, unused, unused, unused, unused, new FsrsRepository(prisma), defaults, reminders as never);
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-trainer-spec' } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'fsrs-trainer-spec' } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        user = await prisma.user.create({ data: { email: `fsrs-trainer-spec-${Date.now()}@example.com`, firstName: 'A', lastName: 'B' } });
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId: user.id, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        folderId = folder.id;
        words = [await createVocab('one', true), await createVocab('two', true), await createVocab('three', true)];
        wordWithoutTranslation = await createVocab('four', false);
    });

    test('creates one card per word and direction (3 words, both directions = 6 cards)', async () => {
        // Act
        const trainer = await service.create(input(), user.id);

        // Assert
        const cards = await cardsOf(trainer.id);
        expect(cards).toHaveLength(6);
        expect(cards.every((c) => c.state === 'NEW' && c.userId === user.id)).toBe(true);
        expect(trainer.mode).toBe('FSRS');
        expect(trainer.fsrsDirections).toEqual(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']);
    });

    test('creates one card per word for a single direction (3 cards)', async () => {
        // Act
        const trainer = await service.create(input({ fsrsDirections: ['TARGET_TO_SOURCE'] }), user.id);

        // Assert
        const cards = await cardsOf(trainer.id);
        expect(cards).toHaveLength(3);
        expect(new Set(cards.map((c) => c.direction))).toEqual(new Set(['TARGET_TO_SOURCE']));
    });

    test('skips a word without a translation and reports it', async () => {
        // Act
        const trainer = await service.create(input({ vocabAssignmentIds: [...words, wordWithoutTranslation] }), user.id);

        // Assert
        expect(await cardsOf(trainer.id)).toHaveLength(6);
        expect(trainer.fsrsSkippedVocabIds).toEqual([wordWithoutTranslation]);
        expect(trainer.vocabAssignments).toHaveLength(4);
    });

    test('a Classic trainer gets no cards', async () => {
        // Act
        const trainer = await service.create(input({ mode: 'CLASSIC', questionType: QuestionType.MULTIPLE_CHOICE }), user.id);

        // Assert
        expect(await cardsOf(trainer.id)).toHaveLength(0);
        expect(trainer.mode).toBe('CLASSIC');
    });

    test('rejects FSRS settings on a Classic trainer', async () => {
        // Act
        const attempt = service.create(input({ mode: 'CLASSIC', questionType: QuestionType.MULTIPLE_CHOICE, fsrsDesiredRetention: 0.8 }), user.id);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    });

    test('rejects a question type FSRS cannot review', async () => {
        // Act
        const attempt = service.create(input({ questionType: QuestionType.MULTIPLE_CHOICE }), user.id);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        expect(await prisma.vocabTrainer.count({ where: { userId: user.id } })).toBe(0);
    });

    test('removing a word deletes its cards, keeps its logs and leaves the other cards untouched', async () => {
        // Arrange
        const trainer = await service.create(input(), user.id);
        const [kept, removed] = [words[0], words[1]];
        const removedCard = await prisma.vocabFsrsCard.findFirstOrThrow({ where: { vocabTrainerId: trainer.id, vocabId: removed } });
        await prisma.vocabFsrsReviewLog.create({
            data: {
                answerId: 'log-1',
                userId: user.id,
                vocabId: removed,
                vocabTrainerId: trainer.id,
                direction: removedCard.direction,
                rating: 'GOOD',
                prevState: 'NEW',
                elapsedDays: 0,
                stateAfter: 'REVIEW',
                dueAfter: new Date(),
                stabilityAfter: 3,
                difficultyAfter: 5,
                scheduledDaysAfter: 3,
                desiredRetentionAtReview: 0.9,
                questionType: 'FLIP_CARD',
                reviewedAt: new Date(),
            },
        });
        await prisma.vocabFsrsCard.updateMany({ where: { vocabTrainerId: trainer.id, vocabId: kept }, data: { reps: 4, state: 'REVIEW', stability: 12 } });

        // Act
        await service.update(trainer.id, input({ vocabAssignmentIds: [kept, words[2]] }), user.id);

        // Assert
        const cards = await cardsOf(trainer.id);
        expect(cards).toHaveLength(4);
        expect(cards.some((c) => c.vocabId === removed)).toBe(false);
        expect(cards.filter((c) => c.vocabId === kept).map((c) => c.reps)).toEqual([4, 4]);
        expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainer.id, answerId: 'log-1' } })).toBe(1);
    });

    test('adding a word creates only its cards', async () => {
        // Arrange
        const trainer = await service.create(input({ vocabAssignmentIds: [words[0]] }), user.id);

        // Act
        await service.update(trainer.id, input({ vocabAssignmentIds: words }), user.id);

        // Assert
        expect(await cardsOf(trainer.id)).toHaveLength(6);
    });

    test('rejects changing mode or directions, accepts the same values and other settings', async () => {
        // Arrange
        const trainer = await service.create(input(), user.id);

        // Act + Assert
        await expect(service.update(trainer.id, input({ mode: 'CLASSIC' }), user.id)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.update(trainer.id, input({ fsrsDirections: ['SOURCE_TO_TARGET'] }), user.id)).rejects.toBeInstanceOf(BadRequestException);
        const sameDirectionsNewSettings = input({ fsrsDirections: ['TARGET_TO_SOURCE', 'SOURCE_TO_TARGET'], fsrsDesiredRetention: 0.85, fsrsNewPerDay: 5 });
        const updated = await service.update(trainer.id, sameDirectionsNewSettings, user.id);
        expect(updated.fsrsDesiredRetention).toBe(0.85);
        expect(updated.fsrsNewPerDay).toBe(5);
        expect(await cardsOf(trainer.id)).toHaveLength(6);
    });

    test('Classic submit endpoints refuse an FSRS trainer and leave it untouched', async () => {
        // Arrange
        const trainer = await service.create(input(), user.id);

        // Act
        const attempt = service.submitFillInBlank(trainer.id, { countTime: 1, wordTestInputs: [{ userAnswer: 'a', systemAnswer: 'b' }] } as never, user);

        // Assert
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        const row = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainer.id } });
        expect(row.lastExamSubmittedAt).toBeNull();
    });

    describe('defaults of the user', () => {
        test('a trainer created without FSRS values copies the defaults of the user', async () => {
            // Arrange
            await defaults.updateSettings(user.id, { defaults: { desiredRetention: 0.85, directions: ['TARGET_TO_SOURCE'], reminderEnabled: false } });

            // Act
            const trainer = await service.create(input({ fsrsDirections: undefined }), user.id);

            // Assert
            expect(trainer).toMatchObject({ fsrsDesiredRetention: 0.85, fsrsDirections: ['TARGET_TO_SOURCE'], reminderDisabled: true });
            expect(await cardsOf(trainer.id)).toHaveLength(3);
        });

        test('changing the defaults later does not change a trainer that already exists', async () => {
            // Arrange
            await defaults.updateSettings(user.id, { defaults: { desiredRetention: 0.85 } });
            const trainer = await service.create(input(), user.id);

            // Act
            await defaults.updateSettings(user.id, { defaults: { desiredRetention: 0.75, directions: ['SOURCE_TO_TARGET'] } });

            // Assert
            const row = await prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainer.id } });
            expect(row.fsrsDesiredRetention).toBe(0.85);
            expect(row.fsrsDirections).toEqual(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']);
        });

        test('what the create request carries wins over the defaults', async () => {
            // Arrange
            await defaults.updateSettings(user.id, { defaults: { desiredRetention: 0.85 } });

            // Act
            const trainer = await service.create(input({ fsrsDesiredRetention: 0.95, reminderDisabled: false }), user.id);

            // Assert
            expect(trainer).toMatchObject({ fsrsDesiredRetention: 0.95, reminderDisabled: false });
        });

        test('a Classic trainer ignores the defaults', async () => {
            // Arrange
            await defaults.updateSettings(user.id, { defaults: { desiredRetention: 0.85, reminderEnabled: false } });

            // Act
            const trainer = await service.create(input({ mode: 'CLASSIC', questionType: QuestionType.MULTIPLE_CHOICE }), user.id);

            // Assert
            expect(trainer).toMatchObject({ mode: 'CLASSIC', fsrsDesiredRetention: 0.9, reminderDisabled: false });
        });
    });

    describe('updateFsrsSettings', () => {
        const inDays = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        test('changes the settings that stay editable and keeps the rest', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);
            const endsAt = inDays(30);

            // Act
            const updated = await service.updateFsrsSettings(trainer.id, { desiredRetention: 0.8, maximumInterval: 90, newPerDay: 7, endsAt }, user.id);

            // Assert
            expect(updated).toMatchObject({ fsrsDesiredRetention: 0.8, fsrsMaximumInterval: 90, fsrsNewPerDay: 7, mode: 'FSRS' });
            expect(updated.fsrsEndsAt?.getTime()).toBe(endsAt.getTime());
            expect(updated.fsrsDirections).toEqual(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']);
            expect(await cardsOf(trainer.id)).toHaveLength(6);
        });

        test('null clears the new-word limit and the deadline, and a missing key keeps the value', async () => {
            // Arrange
            const trainer = await service.create(input({ fsrsNewPerDay: 5, fsrsEndsAt: inDays(10) }), user.id);

            // Act
            const cleared = await service.updateFsrsSettings(trainer.id, { newPerDay: null, endsAt: null }, user.id);
            const untouched = await service.updateFsrsSettings(trainer.id, { desiredRetention: 0.92 }, user.id);

            // Assert
            expect(cleared).toMatchObject({ fsrsNewPerDay: null, fsrsEndsAt: null });
            expect(untouched).toMatchObject({ fsrsNewPerDay: null, fsrsEndsAt: null, fsrsDesiredRetention: 0.92 });
        });

        test('rejects mode, directions and a deadline in the past', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);

            // Act + Assert
            await expect(service.updateFsrsSettings(trainer.id, { mode: 'CLASSIC' }, user.id)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.updateFsrsSettings(trainer.id, { directions: ['SOURCE_TO_TARGET'] }, user.id)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.updateFsrsSettings(trainer.id, { endsAt: inDays(-1) }, user.id)).rejects.toBeInstanceOf(BadRequestException);
        });

        test('rejects a Classic trainer and a trainer of another user', async () => {
            // Arrange
            const classic = await service.create(input({ mode: 'CLASSIC', questionType: QuestionType.MULTIPLE_CHOICE }), user.id);
            const fsrs = await service.create(input(), user.id);

            // Act + Assert
            await expect(service.updateFsrsSettings(classic.id, { desiredRetention: 0.8 }, user.id)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.updateFsrsSettings(fsrs.id, { desiredRetention: 0.8 }, 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('clone (a new cycle)', () => {
        const inDays = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        test('copies the words, directions and settings into a new trainer with its own NEW cards', async () => {
            // Arrange
            const settings = { fsrsDirections: ['TARGET_TO_SOURCE'], fsrsDesiredRetention: 0.85, fsrsMaximumInterval: 90, fsrsNewPerDay: 4, fsrsEndsAt: inDays(5) } as const;
            const original = await service.create(input({ ...settings, fsrsDirections: [...settings.fsrsDirections], reminderDisabled: true }), user.id);

            // Act
            const copy = await service.clone(original.id, { name: 'Second round' }, user.id);

            // Assert
            expect(copy.id).not.toBe(original.id);
            expect(copy).toMatchObject({
                name: 'Second round',
                mode: 'FSRS',
                questionType: QuestionType.FLIP_CARD,
                fsrsDirections: ['TARGET_TO_SOURCE'],
                fsrsDesiredRetention: 0.85,
                fsrsMaximumInterval: 90,
                fsrsNewPerDay: 4,
                fsrsEndsAt: null,
                reminderDisabled: true,
            });
            expect((copy.vocabAssignments ?? []).map((assignment) => assignment.vocabId).sort()).toEqual([...words].sort());
            const cards = await cardsOf(copy.id);
            expect(cards).toHaveLength(3);
            expect(cards.every((card) => card.state === 'NEW' && card.reps === 0 && card.lastReviewedAt === null)).toBe(true);
        });

        test('takes the new deadline, and a trainer without one stays open-ended', async () => {
            // Arrange
            const original = await service.create(input(), user.id);
            const endsAt = inDays(20);

            // Act
            const withDeadline = await service.clone(original.id, { name: 'With a deadline', endsAt }, user.id);
            const withoutDeadline = await service.clone(original.id, { name: 'Open', endsAt: null }, user.id);

            // Assert
            expect(withDeadline.fsrsEndsAt?.getTime()).toBe(endsAt.getTime());
            expect(withoutDeadline.fsrsEndsAt).toBeNull();
        });

        test('leaves the original trainer, its cards and its logs untouched', async () => {
            // Arrange
            const original = await service.create(input(), user.id);
            const card = await prisma.vocabFsrsCard.findFirstOrThrow({ where: { vocabTrainerId: original.id } });
            await prisma.vocabFsrsCard.update({ where: { id: card.id }, data: { state: 'REVIEW', reps: 3, stability: 12, lastReviewedAt: new Date() } });
            await prisma.vocabFsrsReviewLog.create({
                data: {
                    answerId: 'clone-log-1',
                    userId: user.id,
                    vocabId: card.vocabId,
                    vocabTrainerId: original.id,
                    direction: card.direction,
                    rating: 'GOOD',
                    prevState: 'NEW',
                    elapsedDays: 0,
                    stateAfter: 'REVIEW',
                    dueAfter: new Date(),
                    stabilityAfter: 12,
                    difficultyAfter: 5,
                    scheduledDaysAfter: 12,
                    desiredRetentionAtReview: 0.9,
                    questionType: 'FLIP_CARD',
                    reviewedAt: new Date(),
                },
            });
            const cardsBefore = await cardsOf(original.id);

            // Act
            const copy = await service.clone(original.id, { name: 'Second round' }, user.id);

            // Assert
            expect(await cardsOf(original.id)).toEqual(cardsBefore);
            expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: original.id } })).toBe(1);
            expect(await prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: copy.id } })).toBe(0);
            expect((await cardsOf(copy.id)).every((c) => c.state === 'NEW')).toBe(true);
        });

        test('works on an ended trainer, which is how a new cycle usually starts', async () => {
            // Arrange
            const ended = await service.create(input({ fsrsEndsAt: inDays(-2) }), user.id);

            // Act
            const copy = await service.clone(ended.id, { name: 'Again', endsAt: inDays(14) }, user.id);

            // Assert
            expect(await cardsOf(copy.id)).toHaveLength(6);
            expect(await cardsOf(ended.id)).toHaveLength(6);
        });

        test('reports the words that still have no translation', async () => {
            // Arrange
            const original = await service.create(input({ vocabAssignmentIds: [...words, wordWithoutTranslation] }), user.id);

            // Act
            const copy = await service.clone(original.id, { name: 'Second round' }, user.id);

            // Assert
            expect(copy.fsrsSkippedVocabIds).toEqual([wordWithoutTranslation]);
            expect(await cardsOf(copy.id)).toHaveLength(6);
        });

        test('rejects a deadline in the past without creating anything', async () => {
            // Arrange
            const original = await service.create(input(), user.id);

            // Act
            const attempt = service.clone(original.id, { name: 'Late', endsAt: inDays(-1) }, user.id);

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
            expect(await prisma.vocabTrainer.count({ where: { userId: user.id } })).toBe(1);
        });

        test('rejects a Classic trainer and a trainer of another user', async () => {
            // Arrange
            const classic = await service.create(input({ mode: 'CLASSIC', questionType: QuestionType.MULTIPLE_CHOICE }), user.id);
            const fsrs = await service.create(input(), user.id);

            // Act + Assert
            await expect(service.clone(classic.id, { name: 'x' }, user.id)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.clone(fsrs.id, { name: 'x' }, 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
            expect(await prisma.vocabTrainer.count({ where: { userId: user.id } })).toBe(2);
        });

        test('extending an ended trainer makes it active again with the cards it already has', async () => {
            // Arrange
            const ended = await service.create(input({ fsrsEndsAt: inDays(-2) }), user.id);
            const cardsBefore = await cardsOf(ended.id);

            // Act
            const extended = await service.updateFsrsSettings(ended.id, { endsAt: inDays(10) }, user.id);

            // Assert
            expect(extended.fsrsEndsAt?.getTime()).toBeGreaterThan(Date.now());
            expect(await cardsOf(ended.id)).toEqual(cardsBefore);
        });
    });

    describe('reminders', () => {
        beforeEach(() => {
            reminders.sync.mockClear();
            reminders.cancelForTrainer.mockClear();
        });

        test('a new FSRS trainer plans its first reminder after it was saved', async () => {
            // Act
            const trainer = await service.create(input(), user.id);

            // Assert
            expect(reminders.sync).toHaveBeenCalledWith(user.id, trainer.id);
        });

        test('a new cycle plans its own reminder', async () => {
            // Arrange
            const source = await service.create(input(), user.id);
            reminders.sync.mockClear();

            // Act
            const cycle = await service.clone(source.id, { name: 'Second round' }, user.id);

            // Assert
            expect(reminders.sync).toHaveBeenCalledTimes(1);
            expect(reminders.sync).toHaveBeenCalledWith(user.id, cycle.id);
        });

        test('changing the settings or the words of an FSRS trainer plans the reminder again', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);
            reminders.sync.mockClear();

            // Act
            await service.updateFsrsSettings(trainer.id, { newPerDay: 5 }, user.id);
            await service.update(trainer.id, input({ vocabAssignmentIds: [words[0]] }), user.id);
            await service.update(trainer.id, input({ name: 'Renamed' }), user.id);

            // Assert
            expect(reminders.sync).toHaveBeenCalledTimes(3);
            expect(reminders.sync).toHaveBeenCalledWith(user.id, trainer.id);
        });

        test('a Classic trainer never touches the FSRS reminders', async () => {
            // Arrange
            const classic = await service.create(input({ mode: 'CLASSIC' }), user.id);

            // Act
            await service.update(classic.id, input({ name: 'Renamed', mode: 'CLASSIC' }), user.id);
            await service.delete(classic.id, user.id);

            // Assert
            expect(reminders.sync).not.toHaveBeenCalled();
            expect(reminders.cancelForTrainer).not.toHaveBeenCalled();
        });

        test('deleting an FSRS trainer cancels its reminders', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);

            // Act
            await service.delete(trainer.id, user.id);

            // Assert
            expect(reminders.cancelForTrainer).toHaveBeenCalledWith(trainer.id, 'trainer_deleted');
        });
    });

    test('deleting the user still works with words in a trainer', async () => {
        // Arrange
        await service.create(input(), user.id);

        // Act
        const deleted = await prisma.user.deleteMany({ where: { id: user.id } });

        // Assert
        expect(deleted.count).toBe(1);
    });

    describe('removeVocab', () => {
        test('removes the word from the trainer, its cards go and the other cards stay', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);
            const [removed, kept] = words as [string, string];

            // Act
            await service.removeVocab(trainer.id, removed, user.id);

            // Assert
            const cards = await cardsOf(trainer.id);
            expect(cards.some((c) => c.vocabId === removed)).toBe(false);
            expect(cards.filter((c) => c.vocabId === kept)).toHaveLength(2);
            expect(await prisma.vocab.findUnique({ where: { id: removed } })).not.toBeNull();
            expect(reminders.sync).toHaveBeenCalledWith(user.id, trainer.id);
        });

        test('404 when the word is not in the trainer, and nothing changes', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);
            const before = await cardsOf(trainer.id);

            // Act + Assert
            await expect(service.removeVocab(trainer.id, wordWithoutTranslation, user.id)).rejects.toBeInstanceOf(VocabTrainerWordNotFoundException);
            expect(await cardsOf(trainer.id)).toHaveLength(before.length);
        });

        test('404 for a trainer of another user, and the word stays in it', async () => {
            // Arrange
            const trainer = await service.create(input(), user.id);
            const other = await prisma.user.create({ data: { email: `fsrs-trainer-spec-other-${Date.now()}@example.com`, firstName: 'C', lastName: 'D' } });

            // Act + Assert
            await expect(service.removeVocab(trainer.id, words[0], other.id)).rejects.toBeInstanceOf(VocabTrainerNotFoundException);
            expect(await cardsOf(trainer.id)).toHaveLength(6);
        });
    });
});
