import type { ShownDirection } from '@/domains/vocab/types';
import type { FsrsDirection } from '@prisma/client';
import { createHash } from 'crypto';

/**
 * The direction a card is asked in. Recognise and Recall cards keep their own. A Random card is asked in a random
 * direction that stays the same until the card is answered (its last review changes the pick), so the question on screen
 * and the check of the typed answer always agree.
 */
export function shownDirection(card: { id: string; direction: FsrsDirection; lastReviewedAt: Date | null }): ShownDirection {
    if (card.direction !== 'RANDOM') {
        return card.direction;
    }

    const seed = `${card.id}:${card.lastReviewedAt?.toISOString() ?? 'new'}`;
    const pickFirstSide = createHash('sha256').update(seed).digest().readUInt8(0) % 2 === 0;

    return pickFirstSide ? 'SOURCE_TO_TARGET' : 'TARGET_TO_SOURCE';
}
