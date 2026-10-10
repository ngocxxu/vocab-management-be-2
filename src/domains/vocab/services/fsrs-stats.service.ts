import { ConfigService } from '@/domains/platform/config/services/config.service';
import { Injectable } from '@nestjs/common';
import { FsrsMapper } from '../mappers/fsrs.mapper';
import { FsrsRepository, MASTERED_MIN_STABILITY_DAYS } from '../repositories/fsrs.repository';
import { FsrsDirectionStats, FsrsReviewStats, FsrsStabilityBucket, FsrsUserSummary } from '../types';
import { endOfLocalDay, localDateLabel, resolveTimezone, SRS_TIMEZONE_CONFIG_KEY, startOfLocalDay } from '../utils/fsrs-local-day.util';
import { FsrsService } from './fsrs.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FORECAST_DAYS = 30;
const RETENTION_WINDOW_DAYS = 30;
const LEECH_LIST_LIMIT = 20;

// Upper bounds (exclusive) of the stability buckets, in days; the last bucket has no upper bound.
const STABILITY_BUCKETS: Array<{ label: string; below: number }> = [
    { label: '<1d', below: 1 },
    { label: '1-7d', below: 7 },
    { label: '7-30d', below: 30 },
    { label: '30-90d', below: 90 },
    { label: '90-180d', below: MASTERED_MIN_STABILITY_DAYS },
    { label: '180d+', below: Number.POSITIVE_INFINITY },
];

/**
 * Statistics of FSRS trainers. They read the cards and the review logs only: the mastery score and the charts of Classic stay
 * as they are.
 */
@Injectable()
export class FsrsStatsService {
    private readonly fsrsMapper = new FsrsMapper();

    public constructor(
        private readonly fsrsRepository: FsrsRepository,
        private readonly fsrsService: FsrsService,
        private readonly configService: ConfigService,
    ) {}

    public async getTrainerStats(userId: string, trainerId: string, now: Date = new Date()): Promise<FsrsReviewStats> {
        const trainer = await this.fsrsRepository.findFsrsTrainerOrThrow(userId, trainerId);
        const settings = this.fsrsMapper.toSettings(trainer);
        const ended = this.fsrsService.isCycleEnded(settings, now);
        const retentionSince = new Date(now.getTime() - RETENTION_WINDOW_DAYS * MS_PER_DAY);

        const [cardCounts, masteredCounts, leechCounts, stabilities, outcomes, leechCards] = await Promise.all([
            this.fsrsRepository.countCardsByDirectionAndState(trainerId),
            this.fsrsRepository.countMasteredByDirection(trainerId),
            this.fsrsRepository.countLeechesByDirection(trainerId),
            this.fsrsRepository.findReviewStabilities(trainerId),
            this.fsrsRepository.countReviewOutcomesSince(trainerId, retentionSince),
            this.fsrsRepository.findLeechCards(trainerId, LEECH_LIST_LIMIT),
        ]);

        const byDirection: FsrsDirectionStats[] = settings.directions.map((direction) => {
            const countOf = (state: 'NEW' | 'REVIEW'): number => cardCounts.find((row) => row.direction === direction && row.state === state)?.count ?? 0;

            return {
                direction,
                cards: countOf('NEW') + countOf('REVIEW'),
                new: countOf('NEW'),
                review: countOf('REVIEW'),
                mastered: masteredCounts.find((row) => row.direction === direction)?.count ?? 0,
                leeches: leechCounts.find((row) => row.direction === direction)?.count ?? 0,
            };
        });
        const sum = (pick: (row: FsrsDirectionStats) => number): number => byDirection.reduce((total, row) => total + pick(row), 0);

        return {
            ended,
            cardsByState: { new: sum((row) => row.new), review: sum((row) => row.review) },
            mastered: sum((row) => row.mastered),
            leeches: sum((row) => row.leeches),
            byDirection,
            forecast: ended ? [] : await this.buildForecast(userId, trainerId, now),
            trueRetention: {
                value: outcomes.reviews > 0 ? Math.round(((outcomes.reviews - outcomes.again) / outcomes.reviews) * 1000) / 1000 : null,
                reviews: outcomes.reviews,
                windowDays: RETENTION_WINDOW_DAYS,
            },
            stabilityBuckets: this.bucketStabilities(stabilities),
            leechCards,
        };
    }

    /** The FSRS numbers for the dashboard summary. A trainer whose cycle has ended has nothing due, but its mastered cards still count. */
    public async getUserSummary(userId: string, now: Date = new Date()): Promise<FsrsUserSummary> {
        const timeZone = await this.timezoneOf(userId);
        const [fsrsDueToday, fsrsMastered] = await Promise.all([
            this.fsrsRepository.countDueForUser(userId, endOfLocalDay(now, timeZone), now),
            this.fsrsRepository.countMasteredForUser(userId),
        ]);

        return { fsrsDueToday, fsrsMastered };
    }

    private async timezoneOf(userId: string): Promise<string> {
        return resolveTimezone(await this.configService.getConfig(userId, SRS_TIMEZONE_CONFIG_KEY));
    }

    private async buildForecast(userId: string, trainerId: string, now: Date): Promise<Array<{ date: string; count: number }>> {
        const timeZone = await this.timezoneOf(userId);

        // Day i ends at boundaries[i]; the days are the review days of the user, so they are 23 to 25 hours long around DST.
        const boundaries: Date[] = [];
        let cursor = endOfLocalDay(now, timeZone);
        for (let day = 0; day < FORECAST_DAYS; day++) {
            boundaries.push(cursor);
            cursor = endOfLocalDay(cursor, timeZone);
        }

        const counts = new Array<number>(FORECAST_DAYS).fill(0);
        const dueDates = await this.fsrsRepository.findReviewDueDates(trainerId, boundaries[FORECAST_DAYS - 1]);
        for (const due of dueDates) {
            // The overdue cards are in the first day.
            const day = boundaries.findIndex((boundary) => due.getTime() < boundary.getTime());
            counts[day] = (counts[day] ?? 0) + 1;
        }

        return boundaries.map((_, day) => ({
            date: localDateLabel(day === 0 ? startOfLocalDay(now, timeZone) : boundaries[day - 1], timeZone),
            count: counts[day] ?? 0,
        }));
    }

    private bucketStabilities(stabilities: number[]): FsrsStabilityBucket[] {
        const counts = new Array<number>(STABILITY_BUCKETS.length).fill(0);
        for (const stability of stabilities) {
            const bucket = STABILITY_BUCKETS.findIndex((candidate) => stability < candidate.below);
            counts[bucket] = (counts[bucket] ?? 0) + 1;
        }

        return STABILITY_BUCKETS.map((bucket, index) => ({ label: bucket.label, count: counts[index] ?? 0 }));
    }
}
