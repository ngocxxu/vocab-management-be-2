import type { AdminStatsRepository, SignupDayRow } from '../repositories/admin-stats.repository';
import { UserRole } from '@prisma/client';
import { AdminStatsService } from './admin-stats.service';

// Fixed clock so the 30-day window is deterministic: 2026-09-13 .. 2026-10-12 (UTC), today plus 29 prior days.
const NOW = new Date('2026-10-12T10:00:00.000Z');

type TRepositoryMock = {
    countUsers: jest.Mock;
    groupUsersByRole: jest.Mock;
    countVocabs: jest.Mock;
    countTrainers: jest.Mock;
    countTrainerResults: jest.Mock;
    countReviewLogsSince: jest.Mock;
    countJobFailuresSince: jest.Mock;
    countSignupsByDay: jest.Mock;
};

function createRepositoryMock(overrides: { signupRows?: SignupDayRow[]; roleRows?: Array<{ role: UserRole; _count: number }> } = {}): TRepositoryMock {
    return {
        countUsers: jest.fn().mockImplementation(async (where?: { isActive?: boolean }) => {
            if (where === undefined) return Promise.resolve(10);
            if (where.isActive === true) return Promise.resolve(7);
            if (where.isActive === false) return Promise.resolve(3);
            return Promise.resolve(2);
        }),
        groupUsersByRole: jest.fn().mockResolvedValue(overrides.roleRows ?? []),
        countVocabs: jest.fn().mockResolvedValue(100),
        countTrainers: jest.fn().mockResolvedValue(11),
        countTrainerResults: jest.fn().mockResolvedValue(22),
        countReviewLogsSince: jest.fn().mockResolvedValue(33),
        countJobFailuresSince: jest.fn().mockResolvedValue(4),
        countSignupsByDay: jest.fn().mockResolvedValue(overrides.signupRows ?? []),
    };
}

describe('AdminStatsService', () => {
    const createService = (repository: TRepositoryMock) => new AdminStatsService(repository as unknown as AdminStatsRepository);

    it('returns exactly 30 signup days, oldest first, ending on today (UTC)', async () => {
        const service = createService(createRepositoryMock());

        const stats = await service.getStats(NOW);

        expect(stats.signupsDaily).toHaveLength(30);
        expect(stats.signupsDaily[0]?.date).toBe('2026-09-13');
        expect(stats.signupsDaily[29]?.date).toBe('2026-10-12');
    });

    it('asks the repository for signups from the first UTC day of the window', async () => {
        const repository = createRepositoryMock();
        const service = createService(repository);

        await service.getStats(NOW);

        expect(repository.countSignupsByDay).toHaveBeenCalledWith('2026-09-13');
    });

    it('zero-fills days with no signups and converts bigint counts to numbers', async () => {
        const repository = createRepositoryMock({ signupRows: [{ day: '2026-10-10', count: BigInt(3) }] });
        const service = createService(repository);

        const stats = await service.getStats(NOW);

        const filled = stats.signupsDaily.find((day) => day.date === '2026-10-10');
        expect(filled).toEqual({ date: '2026-10-10', count: 3 });
        expect(typeof filled?.count).toBe('number');
        expect(stats.signupsDaily.filter((day) => day.count === 0)).toHaveLength(29);
    });

    it('fills absent roles with 0 so byRole always has all three keys', async () => {
        const repository = createRepositoryMock({ roleRows: [{ role: UserRole.MEMBER, _count: 4 }] });
        const service = createService(repository);

        const stats = await service.getStats(NOW);

        expect(stats.users.byRole).toEqual({ ADMIN: 0, MEMBER: 4, GUEST: 0 });
    });

    it('maps user totals and the activity split', async () => {
        const service = createService(createRepositoryMock());

        const stats = await service.getStats(NOW);

        expect(stats.users.total).toBe(10);
        expect(stats.users.active).toBe(7);
        expect(stats.users.inactive).toBe(3);
    });

    it('maps content counts and the 24h job failure count', async () => {
        const service = createService(createRepositoryMock());

        const stats = await service.getStats(NOW);

        expect(stats.content).toEqual({ vocabs: 100, trainers: 11, examResults: 22, reviews7d: 33 });
        expect(stats.ops).toEqual({ jobFailures24h: 4 });
    });

    it('bounds the 7-day and 24-hour queries by the fixed clock', async () => {
        const repository = createRepositoryMock();
        const service = createService(repository);

        await service.getStats(NOW);

        const since7 = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
        const since24h = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
        expect(repository.countReviewLogsSince).toHaveBeenCalledWith(since7);
        expect(repository.countJobFailuresSince).toHaveBeenCalledWith(since24h);
    });
});
