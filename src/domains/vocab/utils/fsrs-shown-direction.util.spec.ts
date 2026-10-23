import { shownDirection } from './fsrs-shown-direction.util';

type TestCard = { id: string; direction: 'SOURCE_TO_TARGET' | 'TARGET_TO_SOURCE' | 'RANDOM'; lastReviewedAt: Date | null };

const card = (id: string, direction: TestCard['direction'], lastReviewedAt: Date | null = null): TestCard => ({ id, direction, lastReviewedAt });

describe('shownDirection', () => {
    test('a Recognise card is always shown source to target', () => {
        // Act + Assert
        expect(shownDirection(card('a', 'SOURCE_TO_TARGET'))).toBe('SOURCE_TO_TARGET');
    });

    test('a Recall card is always shown target to source', () => {
        // Act + Assert
        expect(shownDirection(card('a', 'TARGET_TO_SOURCE'))).toBe('TARGET_TO_SOURCE');
    });

    test('a Random card is shown in one of the two directions, never as RANDOM', () => {
        // Act
        const shown = shownDirection(card('a', 'RANDOM'));

        // Assert
        expect(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']).toContain(shown);
    });

    test('the same Random card gets the same direction for the same last review', () => {
        // Arrange
        const answeredAt = new Date('2026-10-04T08:00:00.000Z');

        // Act + Assert
        expect(shownDirection(card('a', 'RANDOM', answeredAt))).toBe(shownDirection(card('a', 'RANDOM', answeredAt)));
    });

    test('over many Random cards both directions come up', () => {
        // Act
        const shown = new Set(Array.from({ length: 40 }, (_, i) => shownDirection(card(`card-${i}`, 'RANDOM'))));

        // Assert
        expect(shown).toEqual(new Set(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']));
    });

    test('after the card is answered again its direction can change', () => {
        // Arrange: one card, reviewed on 20 different days
        const reviews = Array.from({ length: 20 }, (_, day) => new Date(Date.UTC(2026, 9, 1 + day, 8)));

        // Act
        const shown = new Set(reviews.map((reviewedAt) => shownDirection(card('a', 'RANDOM', reviewedAt))));

        // Assert
        expect(shown).toEqual(new Set(['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE']));
    });
});
