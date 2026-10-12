import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

export type SignupDayRow = { day: string; count: bigint };

@Injectable()
export class AdminStatsRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async countUsers(where?: Prisma.UserWhereInput): Promise<number> {
        return this.prisma.user.count({ where });
    }

    public async groupUsersByRole(): Promise<Array<{ role: UserRole; _count: number }>> {
        // Assigned before returning: a declared return type would otherwise drive groupBy's generic inference and reject `_count: true`.
        const groups = await this.prisma.user.groupBy({ by: ['role'], _count: true });
        return groups;
    }

    public async countVocabs(): Promise<number> {
        return this.prisma.vocab.count();
    }

    public async countTrainers(): Promise<number> {
        return this.prisma.vocabTrainer.count();
    }

    public async countTrainerResults(): Promise<number> {
        return this.prisma.vocabTrainerResult.count();
    }

    public async countReviewLogsSince(since: Date): Promise<number> {
        return this.prisma.vocabFsrsReviewLog.count({ where: { reviewedAt: { gte: since } } });
    }

    public async countJobFailuresSince(since: Date): Promise<number> {
        return this.prisma.jobFailure.count({ where: { failedAt: { gte: since } } });
    }

    /**
     * Signups per UTC day from `fromDay` (YYYY-MM-DD) onward.
     * `user.created_at` is `timestamp` without time zone and Prisma writes it in UTC, so bucketing it directly
     * is independent of the database session timezone (`date_trunc` on a timestamptz would not be).
     */
    public async countSignupsByDay(fromDay: string): Promise<SignupDayRow[]> {
        return this.prisma.$queryRaw<SignupDayRow[]>(Prisma.sql`
            SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
            FROM "user"
            WHERE created_at >= ${fromDay}::date
            GROUP BY 1
            ORDER BY 1`);
    }
}
