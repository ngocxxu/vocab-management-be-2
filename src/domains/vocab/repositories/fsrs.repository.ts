import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FsrsDirection, FsrsState, Prisma, TrainerMode, VocabFsrsCard, VocabFsrsReviewLog, VocabTrainer } from '@prisma/client';

// A card is mastered once its memory is stable for about 6 months and it was not forgotten in its last 3 reviews.
export const MASTERED_MIN_STABILITY_DAYS = 180;
const MASTERED_LAPSE_WINDOW = 3;
const LEECH_MIN_LAPSES = 8;

// A lapse is a card that was already known and got Again. The condition is written for the alias `c` of vocab_fsrs_card.
const MASTERED_CARD = Prisma.sql`
    c.state = 'REVIEW'
    AND c.stability >= ${MASTERED_MIN_STABILITY_DAYS}
    AND NOT EXISTS (
        SELECT 1
        FROM (
            SELECT l.rating, l.prev_state
            FROM vocab_fsrs_review_log l
            WHERE l.vocab_trainer_id = c.vocab_trainer_id AND l.vocab_id = c.vocab_id AND l.direction = c.direction
            ORDER BY l.reviewed_at DESC
            LIMIT ${MASTERED_LAPSE_WINDOW}
        ) recent
        WHERE recent.prev_state = 'REVIEW' AND recent.rating = 'AGAIN'
    )
`;

const CARD_WORD_INCLUDE = {
    trainerWord: { include: { vocab: { include: { textTargets: { orderBy: { createdAt: 'asc' } } } } } },
} satisfies Prisma.VocabFsrsCardInclude;

/** A card with the word it asks about and the word's translations. */
export type FsrsCardWithWord = Prisma.VocabFsrsCardGetPayload<{ include: typeof CARD_WORD_INCLUDE }>;

@Injectable()
export class FsrsRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    /**
     * Reads a card and holds its row lock until the transaction ends, so two answers on one card are applied one
     * after another (the second one reads the card the first one wrote).
     */
    public async lockCard(tx: Prisma.TransactionClient, cardId: string): Promise<VocabFsrsCard | null> {
        await tx.$queryRaw`SELECT id FROM vocab_fsrs_card WHERE id = ${cardId} FOR UPDATE`;

        return tx.vocabFsrsCard.findUnique({ where: { id: cardId } });
    }

    public async findTrainer(tx: Prisma.TransactionClient, trainerId: string): Promise<VocabTrainer | null> {
        return tx.vocabTrainer.findUnique({ where: { id: trainerId } });
    }

    public async findLogByAnswerId(tx: Prisma.TransactionClient, answerId: string): Promise<VocabFsrsReviewLog | null> {
        return tx.vocabFsrsReviewLog.findUnique({ where: { answerId } });
    }

    public async createLog(tx: Prisma.TransactionClient, data: Prisma.VocabFsrsReviewLogUncheckedCreateInput): Promise<VocabFsrsReviewLog> {
        return tx.vocabFsrsReviewLog.create({ data });
    }

    public async updateCard(tx: Prisma.TransactionClient, cardId: string, data: Prisma.VocabFsrsCardUncheckedUpdateInput): Promise<VocabFsrsCard> {
        return tx.vocabFsrsCard.update({ where: { id: cardId }, data });
    }

    /** Ids, among `vocabIds`, of the words that have at least one translation: only those can form a card. */
    public async findVocabIdsWithTranslation(tx: Prisma.TransactionClient, vocabIds: string[]): Promise<string[]> {
        const rows = await tx.vocab.findMany({ where: { id: { in: vocabIds }, textTargets: { some: {} } }, select: { id: true } });

        return rows.map((row) => row.id);
    }

    public async findTrainerOf(userId: string, trainerId: string): Promise<VocabTrainer | null> {
        return this.prisma.vocabTrainer.findFirst({ where: { id: trainerId, userId } });
    }

    /** The FSRS trainer of the user. 404 when it does not exist or belongs to someone else, 400 when it is a Classic trainer. */
    public async findFsrsTrainerOrThrow(userId: string, trainerId: string): Promise<VocabTrainer> {
        const trainer = await this.findTrainerOf(userId, trainerId);
        if (!trainer) {
            throw new NotFoundException(`Vocab trainer ${trainerId} not found`);
        }
        if (trainer.mode !== TrainerMode.FSRS) {
            throw new BadRequestException('This trainer is not an FSRS trainer');
        }

        return trainer;
    }

    public async findCardWithWord(cardId: string): Promise<FsrsCardWithWord | null> {
        return this.prisma.vocabFsrsCard.findUnique({ where: { id: cardId }, include: CARD_WORD_INCLUDE });
    }

    /** NEW cards are not "due": they are introduced through the daily new-card quota instead. */
    public async findDueReviewCards(trainerId: string, dueBefore: Date): Promise<FsrsCardWithWord[]> {
        return this.prisma.vocabFsrsCard.findMany({
            where: { vocabTrainerId: trainerId, state: 'REVIEW', due: { lt: dueBefore } },
            include: CARD_WORD_INCLUDE,
            orderBy: { id: 'asc' },
        });
    }

    /** In the order the words were added to the trainer, so the same words come first on every call. */
    public async findNewCards(trainerId: string, take: number): Promise<FsrsCardWithWord[]> {
        return this.prisma.vocabFsrsCard.findMany({
            where: { vocabTrainerId: trainerId, state: 'NEW' },
            include: CARD_WORD_INCLUDE,
            orderBy: [{ trainerWord: { createdAt: 'asc' } }, { vocabId: 'asc' }, { direction: 'asc' }],
            take,
        });
    }

    public async countNewCards(trainerId: string): Promise<number> {
        return this.prisma.vocabFsrsCard.count({ where: { vocabTrainerId: trainerId, state: 'NEW' } });
    }

    public async countReviewDue(trainerId: string, range: { from?: Date; before: Date }): Promise<number> {
        return this.prisma.vocabFsrsCard.count({ where: { vocabTrainerId: trainerId, state: 'REVIEW', due: { gte: range.from, lt: range.before } } });
    }

    /** Cards first answered since `since`: a log row whose previous state was NEW is the moment a card is introduced. */
    public async countIntroducedSince(trainerId: string, since: Date): Promise<number> {
        return this.prisma.vocabFsrsReviewLog.count({ where: { vocabTrainerId: trainerId, prevState: 'NEW', reviewedAt: { gte: since } } });
    }

    public async countMastered(trainerId: string): Promise<number> {
        const [row] = await this.prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count FROM vocab_fsrs_card c WHERE c.vocab_trainer_id = ${trainerId} AND ${MASTERED_CARD}
        `;

        return row?.count ?? 0;
    }

    public async countMasteredByDirection(trainerId: string): Promise<Array<{ direction: FsrsDirection; count: number }>> {
        return this.prisma.$queryRaw<Array<{ direction: FsrsDirection; count: number }>>`
            SELECT c.direction AS direction, COUNT(*)::int AS count
            FROM vocab_fsrs_card c
            WHERE c.vocab_trainer_id = ${trainerId} AND ${MASTERED_CARD}
            GROUP BY c.direction
        `;
    }

    /** Mastered cards of every trainer of the user, also those whose cycle has ended: what was learned stays learned. */
    public async countMasteredForUser(userId: string): Promise<number> {
        const [row] = await this.prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count FROM vocab_fsrs_card c WHERE c.user_id = ${userId} AND ${MASTERED_CARD}
        `;

        return row?.count ?? 0;
    }

    /** Cards due before `dueBefore` in the trainers of the user whose cycle has not ended at `now`. Uses the (user_id, due) index. */
    public async countDueForUser(userId: string, dueBefore: Date, now: Date): Promise<number> {
        const [row] = await this.prisma.$queryRaw<Array<{ count: number }>>`
            SELECT COUNT(*)::int AS count
            FROM vocab_fsrs_card c
            INNER JOIN vocab_trainer t ON t.id = c.vocab_trainer_id
            WHERE c.user_id = ${userId}
              AND c.state = 'REVIEW'
              AND c.due < ${dueBefore}
              AND (t.fsrs_ends_at IS NULL OR t.fsrs_ends_at > ${now})
        `;

        return row?.count ?? 0;
    }

    public async countLeeches(trainerId: string): Promise<number> {
        return this.prisma.vocabFsrsCard.count({ where: { vocabTrainerId: trainerId, lapses: { gte: LEECH_MIN_LAPSES } } });
    }

    public async countLeechesByDirection(trainerId: string): Promise<Array<{ direction: FsrsDirection; count: number }>> {
        const rows = await this.prisma.vocabFsrsCard.groupBy({
            by: ['direction'],
            where: { vocabTrainerId: trainerId, lapses: { gte: LEECH_MIN_LAPSES } },
            _count: { _all: true },
        });

        // eslint-disable-next-line no-underscore-dangle
        return rows.map((row) => ({ direction: row.direction, count: row._count._all }));
    }

    public async countCardsByDirectionAndState(trainerId: string): Promise<Array<{ direction: FsrsDirection; state: FsrsState; count: number }>> {
        const rows = await this.prisma.vocabFsrsCard.groupBy({ by: ['direction', 'state'], where: { vocabTrainerId: trainerId }, _count: { _all: true } });

        // eslint-disable-next-line no-underscore-dangle
        return rows.map((row) => ({ direction: row.direction, state: row.state, count: row._count._all }));
    }

    public async findReviewStabilities(trainerId: string): Promise<number[]> {
        const rows = await this.prisma.vocabFsrsCard.findMany({ where: { vocabTrainerId: trainerId, state: 'REVIEW' }, select: { stability: true } });

        return rows.map((row) => row.stability);
    }

    public async findReviewDueDates(trainerId: string, before: Date): Promise<Date[]> {
        const rows = await this.prisma.vocabFsrsCard.findMany({ where: { vocabTrainerId: trainerId, state: 'REVIEW', due: { lt: before } }, select: { due: true } });

        return rows.map((row) => row.due);
    }

    /** Reviews of cards that were already known (not the first answer of a NEW card) since `since`, and how many of them were Again. */
    public async countReviewOutcomesSince(trainerId: string, since: Date): Promise<{ reviews: number; again: number }> {
        const where = { vocabTrainerId: trainerId, prevState: 'REVIEW' as const, reviewedAt: { gte: since } };
        const [reviews, again] = await Promise.all([
            this.prisma.vocabFsrsReviewLog.count({ where }),
            this.prisma.vocabFsrsReviewLog.count({ where: { ...where, rating: 'AGAIN' } }),
        ]);

        return { reviews, again };
    }

    public async findLeechCards(
        trainerId: string,
        take: number,
    ): Promise<Array<{ cardId: string; vocabId: string; direction: FsrsDirection; textSource: string; lapses: number }>> {
        const rows = await this.prisma.vocabFsrsCard.findMany({
            where: { vocabTrainerId: trainerId, lapses: { gte: LEECH_MIN_LAPSES } },
            include: { trainerWord: { include: { vocab: { select: { textSource: true } } } } },
            orderBy: [{ lapses: 'desc' }, { id: 'asc' }],
            take,
        });

        return rows.map((row) => ({ cardId: row.id, vocabId: row.vocabId, direction: row.direction, textSource: row.trainerWord.vocab.textSource, lapses: row.lapses }));
    }

    /** Existing cards are kept as they are (skipDuplicates), so calling this again for the same words changes nothing. */
    public async createCards(tx: Prisma.TransactionClient, data: Prisma.VocabFsrsCardCreateManyInput[]): Promise<{ count: number }> {
        return tx.vocabFsrsCard.createMany({ data, skipDuplicates: true });
    }
}
