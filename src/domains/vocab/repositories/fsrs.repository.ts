import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { FsrsDirection, Prisma, VocabFsrsCard, VocabFsrsReviewLog, VocabTrainer } from '@prisma/client';

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

    public async findStableCards(trainerId: string, minStability: number): Promise<Array<{ vocabId: string; direction: FsrsDirection }>> {
        return this.prisma.vocabFsrsCard.findMany({
            where: { vocabTrainerId: trainerId, state: 'REVIEW', stability: { gte: minStability } },
            select: { vocabId: true, direction: true },
        });
    }

    public async countLeeches(trainerId: string, minLapses: number): Promise<number> {
        return this.prisma.vocabFsrsCard.count({ where: { vocabTrainerId: trainerId, lapses: { gte: minLapses } } });
    }

    /** True when one of the last `window` reviews of the card was a lapse (a REVIEW card answered Again). */
    public async hasRecentLapse(trainerId: string, vocabId: string, direction: FsrsDirection, window: number): Promise<boolean> {
        const recent = await this.prisma.vocabFsrsReviewLog.findMany({
            where: { vocabTrainerId: trainerId, vocabId, direction },
            orderBy: { reviewedAt: 'desc' },
            take: window,
            select: { rating: true, prevState: true },
        });

        return recent.some((log) => log.prevState === 'REVIEW' && log.rating === 'AGAIN');
    }

    /** Existing cards are kept as they are (skipDuplicates), so calling this again for the same words changes nothing. */
    public async createCards(tx: Prisma.TransactionClient, data: Prisma.VocabFsrsCardCreateManyInput[]): Promise<{ count: number }> {
        return tx.vocabFsrsCard.createMany({ data, skipDuplicates: true });
    }
}
