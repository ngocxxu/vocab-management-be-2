import type { AdminStatsDto } from '../dto/admin-stats.dto';
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminStatsRepository } from '../repositories/admin-stats.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WEEK_DAYS = 7;
const RECENT_MONTH_DAYS = 30;
const SIGNUP_WINDOW_DAYS = 30;

function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toUtcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

@Injectable()
export class AdminStatsService {
    public constructor(private readonly adminStatsRepository: AdminStatsRepository) {}

    /** `now` is injectable so the 7-day, 24-hour and 30-day windows can be pinned in tests. */
    public async getStats(now: Date = new Date()): Promise<AdminStatsDto> {
        const since7d = new Date(now.getTime() - RECENT_WEEK_DAYS * DAY_MS);
        const since24h = new Date(now.getTime() - DAY_MS);
        const since30d = new Date(now.getTime() - RECENT_MONTH_DAYS * DAY_MS);
        // Today plus the 29 days before it: 30 buckets in total.
        const signupFrom = new Date(startOfUtcDay(now).getTime() - (SIGNUP_WINDOW_DAYS - 1) * DAY_MS);

        const repository = this.adminStatsRepository;
        const [total, active, inactive, new7d, new30d, roleGroups, vocabs, trainers, examResults, reviews7d, jobFailures24h, signupRows] = await Promise.all([
            repository.countUsers(),
            repository.countUsers({ isActive: true }),
            repository.countUsers({ isActive: false }),
            repository.countUsers({ createdAt: { gte: since7d } }),
            repository.countUsers({ createdAt: { gte: since30d } }),
            repository.groupUsersByRole(),
            repository.countVocabs(),
            repository.countTrainers(),
            repository.countTrainerResults(),
            repository.countReviewLogsSince(since7d),
            repository.countJobFailuresSince(since24h),
            repository.countSignupsByDay(toUtcDay(signupFrom)),
        ]);

        // Every role appears, even with zero users, so the FE never has to handle a missing key.
        const roleCounts = new Map(roleGroups.map(({ role, _count: count }) => [role, count]));
        const byRole = Object.fromEntries(Object.values(UserRole).map((role) => [role, roleCounts.get(role) ?? 0])) as Record<UserRole, number>;

        const signupCounts = new Map(signupRows.map((row) => [row.day, Number(row.count)]));
        const signupsDaily = Array.from({ length: SIGNUP_WINDOW_DAYS }, (_, index) => {
            const date = toUtcDay(new Date(signupFrom.getTime() + index * DAY_MS));
            return { date, count: signupCounts.get(date) ?? 0 };
        });

        return {
            users: { total, active, inactive, byRole, new7d, new30d },
            signupsDaily,
            content: { vocabs, trainers, examResults, reviews7d },
            ops: { jobFailures24h },
        };
    }
}
