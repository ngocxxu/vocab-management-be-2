import { FsrsMapper } from './fsrs.mapper';

describe('FsrsMapper', () => {
    const mapper = new FsrsMapper();

    test('toSettings maps the fsrs* trainer columns to the unprefixed settings object', () => {
        // Arrange
        const endsAt = new Date('2026-11-12T16:59:59.000Z');
        const trainer = {
            fsrsDesiredRetention: 0.85,
            fsrsMaximumInterval: 365,
            fsrsNewPerDay: 10,
            fsrsDirections: ['TARGET_TO_SOURCE' as const],
            fsrsEndsAt: endsAt,
            name: 'unrelated column',
        };

        // Act
        const settings = mapper.toSettings(trainer);

        // Assert
        expect(settings).toEqual({
            desiredRetention: 0.85,
            maximumInterval: 365,
            newPerDay: 10,
            directions: ['TARGET_TO_SOURCE'],
            endsAt,
        });
    });

    test('toSettings keeps null for "no new-card limit" and "no deadline"', () => {
        // Arrange
        const trainer = {
            fsrsDesiredRetention: 0.9,
            fsrsMaximumInterval: 36500,
            fsrsNewPerDay: null,
            fsrsDirections: ['SOURCE_TO_TARGET' as const, 'TARGET_TO_SOURCE' as const],
            fsrsEndsAt: null,
        };

        // Act
        const settings = mapper.toSettings(trainer);

        // Assert
        expect(settings.newPerDay).toBeNull();
        expect(settings.endsAt).toBeNull();
        expect(settings.directions).toEqual(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']);
    });

    test('toColumns maps the changed settings to the fsrs* trainer columns and leaves the rest out', () => {
        // Arrange
        const endsAt = new Date('2026-11-12T16:59:59.000Z');

        // Act
        const columns = mapper.toColumns({ desiredRetention: 0.85, endsAt });

        // Assert
        expect(columns).toEqual({ fsrsDesiredRetention: 0.85, fsrsEndsAt: endsAt });
    });

    test('toColumns keeps null so "no limit" and "no deadline" can be set', () => {
        // Act
        const columns = mapper.toColumns({ newPerDay: null, endsAt: null });

        // Assert
        expect(columns).toEqual({ fsrsNewPerDay: null, fsrsEndsAt: null });
    });

    test('toColumns of an empty patch changes nothing', () => {
        expect(mapper.toColumns({})).toEqual({});
    });

    test('toCardState keeps only the scheduling columns of a VocabFsrsCard row', () => {
        // Arrange
        const due = new Date('2026-10-05T04:00:00.000Z');
        const lastReviewedAt = new Date('2026-10-03T04:00:00.000Z');
        const row = {
            id: 'card-1',
            vocabTrainerId: 'trainer-1',
            vocabId: 'vocab-1',
            direction: 'SOURCE_TO_TARGET' as const,
            userId: 'user-1',
            state: 'REVIEW' as const,
            due,
            stability: 4.2,
            difficulty: 6.1,
            reps: 3,
            lapses: 1,
            scheduledDays: 2,
            lastReviewedAt,
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            updatedAt: new Date('2026-10-03T04:00:00.000Z'),
        };

        // Act
        const card = mapper.toCardState(row);

        // Assert
        expect(card).toEqual({
            state: 'REVIEW',
            due,
            stability: 4.2,
            difficulty: 6.1,
            reps: 3,
            lapses: 1,
            scheduledDays: 2,
            lastReviewedAt,
        });
    });
});
