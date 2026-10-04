import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Prisma, VocabFsrsCard, VocabFsrsReviewLog, VocabTrainer } from '@prisma/client';

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

    /** Existing cards are kept as they are (skipDuplicates), so calling this again for the same words changes nothing. */
    public async createCards(tx: Prisma.TransactionClient, data: Prisma.VocabFsrsCardCreateManyInput[]): Promise<{ count: number }> {
        return tx.vocabFsrsCard.createMany({ data, skipDuplicates: true });
    }
}
