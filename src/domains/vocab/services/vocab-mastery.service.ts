import { Injectable } from '@nestjs/common';
import { VocabDto } from '../dto';
import { VocabBadRequestException } from '../exceptions';
import { VocabMasteryRepository, VocabMasteryWithVocab, VocabRepository } from '../repositories';
import { NEEDS_REVIEW_STATUS_FILTERS, NeedsReviewStatusFilter } from '../types';

const TREND_WINDOW_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
}

@Injectable()
export class VocabMasteryService {
    public constructor(
        private readonly vocabMasteryRepository: VocabMasteryRepository,
        private readonly vocabRepository: VocabRepository,
    ) {}

    public async getOrCreateMastery(vocabId: string, userId: string) {
        if (!vocabId || !userId) {
            throw new VocabBadRequestException('Vocab ID and User ID are required');
        }

        let mastery = await this.vocabMasteryRepository.findByVocabIdAndUserId(vocabId, userId);

        if (!mastery) {
            mastery = await this.vocabMasteryRepository.create({
                vocab: { connect: { id: vocabId } },
                user: { connect: { id: userId } },
                masteryScore: 0,
                correctCount: 0,
                incorrectCount: 0,
            });
        }

        return mastery;
    }

    public async updateMastery(vocabId: string, userId: string, isCorrect: boolean) {
        if (!vocabId || !userId) {
            throw new VocabBadRequestException('Vocab ID and User ID are required');
        }

        const mastery = await this.getOrCreateMastery(vocabId, userId);

        const newCorrectCount = isCorrect ? mastery.correctCount + 1 : mastery.correctCount;
        const newIncorrectCount = isCorrect ? mastery.incorrectCount : mastery.incorrectCount + 1;
        const newMasteryScore = isCorrect ? Math.min(10, mastery.masteryScore + 1) : Math.max(0, mastery.masteryScore - 1);

        const updatedMastery = await this.vocabMasteryRepository.update(mastery.id, {
            masteryScore: newMasteryScore,
            correctCount: newCorrectCount,
            incorrectCount: newIncorrectCount,
        });

        await this.saveHistory(mastery.id, newMasteryScore, newCorrectCount, newIncorrectCount);

        return updatedMastery;
    }

    public async saveHistory(vocabMasteryId: string, masteryScore: number, correctCount: number, incorrectCount: number) {
        if (!vocabMasteryId) {
            throw new VocabBadRequestException('Vocab mastery ID is required');
        }

        if (masteryScore < 0 || masteryScore > 10) {
            throw new VocabBadRequestException('Mastery score must be between 0 and 10');
        }

        if (correctCount < 0 || incorrectCount < 0) {
            throw new VocabBadRequestException('Count values must be non-negative');
        }

        await this.vocabMasteryRepository.createHistory({
            vocabMastery: { connect: { id: vocabMasteryId } },
            masteryScore,
            correctCount,
            incorrectCount,
        });
    }

    public async getSummary(userId: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        const trendCutoff = new Date(Date.now() - TREND_WINDOW_DAYS * MILLISECONDS_PER_DAY);
        const [result, lastPractice, healthCounts, totalVocabs, previousSummary] = await Promise.all([
            this.vocabMasteryRepository.aggregateByUserId(userId),
            this.vocabMasteryRepository.findLastPracticeAtByUserId(userId),
            this.vocabMasteryRepository.countHealthByUserId(userId),
            this.vocabRepository.countByUserId(userId),
            this.vocabMasteryRepository.getSummarySnapshotAt(userId, trendCutoff),
        ]);

        // eslint-disable-next-line no-underscore-dangle
        const sum = result._sum;
        // eslint-disable-next-line no-underscore-dangle
        const avg = result._avg;

        const totalCorrect = sum.correctCount || 0;
        const totalIncorrect = sum.incorrectCount || 0;
        const averageMastery = avg.masteryScore || 0;
        const needReviewCount = healthCounts.criticalCount + healthCounts.warningCount;
        const previousAnswerCount = previousSummary.totalCorrect + previousSummary.totalIncorrect;
        const currentAnswerCount = totalCorrect + totalIncorrect;
        const previousAverageMastery = previousSummary.averageMastery;

        return {
            totalVocabs,
            totalCorrect,
            totalIncorrect,
            averageMastery,
            lastPracticeAt: lastPractice?.createdAt ?? null,
            criticalCount: healthCounts.criticalCount,
            warningCount: healthCounts.warningCount,
            trends: {
                totalVocabsPercentDelta: previousSummary.totalVocabs > 0 ? Math.round(((totalVocabs - previousSummary.totalVocabs) / previousSummary.totalVocabs) * 100) : null,
                averageMasteryDelta: previousAverageMastery !== null ? roundToOneDecimal(averageMastery - previousAverageMastery) : null,
                accuracyPercentDelta:
                    previousAnswerCount > 0 && currentAnswerCount > 0
                        ? Math.round((totalCorrect / currentAnswerCount) * 100) - Math.round((previousSummary.totalCorrect / previousAnswerCount) * 100)
                        : null,
                needReviewDelta: previousAverageMastery !== null ? needReviewCount - previousSummary.needReviewCount : null,
            },
        };
    }

    public async getMasteryBySubject(userId: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        return this.vocabMasteryRepository.getMasteryBySubjectRaw(userId);
    }

    public async getProgressOverTime(userId: string, startDate?: string, endDate?: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        if (startDate && endDate && startDate > endDate) {
            throw new VocabBadRequestException('Start date must be before end date');
        }

        return this.vocabMasteryRepository.getProgressOverTimeRaw(userId, startDate, endDate);
    }

    public async getTopProblematicVocabs(userId: string, status: NeedsReviewStatusFilter = 'all', limit: number = 10, page: number = 1, sourceLanguageCode?: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        if (!NEEDS_REVIEW_STATUS_FILTERS.includes(status)) {
            throw new VocabBadRequestException('Status must be one of: critical, warning, all');
        }

        if (limit <= 0 || limit > 100) {
            throw new VocabBadRequestException('Limit must be between 1 and 100');
        }

        if (page <= 0) {
            throw new VocabBadRequestException('Page must be at least 1');
        }

        const offset = (page - 1) * limit;
        const rows = await this.vocabMasteryRepository.findNeedsReviewVocabs(userId, status, limit, offset, sourceLanguageCode);

        if (rows.length === 0) {
            return [];
        }

        const vocabMasteryIds = rows.map((row) => row.vocabMasteryId);
        const masteries = await this.vocabMasteryRepository.findVocabMasteriesWithVocabByIds(vocabMasteryIds);
        const masteryById = new Map<string, VocabMasteryWithVocab>(masteries.map((mastery) => [mastery.id, mastery]));

        return rows.flatMap((row) => {
            const mastery = masteryById.get(row.vocabMasteryId);
            if (!mastery) {
                return [];
            }

            return [
                {
                    vocabId: row.vocabId,
                    vocab: new VocabDto(mastery.vocab),
                    incorrectCount: row.incorrectCount,
                    masteryScore: row.masteryScore,
                    correctCount: row.correctCount,
                    errorRate: row.errorRate,
                    healthStatus: row.healthStatus,
                },
            ];
        });
    }

    public async getProblematicLanguages(userId: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        return this.vocabMasteryRepository.findProblematicLanguageCounts(userId);
    }

    public async getMasteryDistribution(userId: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        return this.vocabMasteryRepository.getMasteryDistributionRaw(userId);
    }

    public async getDashboard(
        userId: string,
        sections: string[],
        dateRange: { startDate?: string; endDate?: string },
    ): Promise<{
        summary?: Awaited<ReturnType<VocabMasteryService['getSummary']>>;
        subjects?: Awaited<ReturnType<VocabMasteryService['getMasteryBySubject']>>;
        problematic?: Awaited<ReturnType<VocabMasteryService['getTopProblematicVocabs']>>;
        distribution?: Awaited<ReturnType<VocabMasteryService['getMasteryDistribution']>>;
        progress?: Awaited<ReturnType<VocabMasteryService['getProgressOverTime']>>;
    }> {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        const [summary, subjects, problematic, distribution, progress] = await Promise.all([
            sections.includes('summary') ? this.getSummary(userId) : undefined,
            sections.includes('subjects') ? this.getMasteryBySubject(userId) : undefined,
            sections.includes('problematic') ? this.getTopProblematicVocabs(userId) : undefined,
            sections.includes('distribution') ? this.getMasteryDistribution(userId) : undefined,
            sections.includes('progress') ? this.getProgressOverTime(userId, dateRange.startDate, dateRange.endDate) : undefined,
        ]);

        return { summary, subjects, problematic, distribution, progress };
    }
}
