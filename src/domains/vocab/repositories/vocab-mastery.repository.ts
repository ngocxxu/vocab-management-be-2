import { BaseRepository } from '@/database';
import { VOCAB_STATUS_THRESHOLDS } from '@/domains/vocab/constants';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Prisma, VocabMastery, Vocab, Language, TextTarget } from '@prisma/client';

export type VocabMasteryWithVocab = VocabMastery & {
    vocab: Vocab & {
        sourceLanguage: Language;
        targetLanguage: Language;
        textTargets: TextTarget[];
    };
};

@Injectable()
export class VocabMasteryRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findByVocabIdAndUserId(vocabId: string, userId: string): Promise<VocabMastery | null> {
        return this.prisma.vocabMastery.findUnique({
            where: {
                vocabId_userId: {
                    vocabId,
                    userId,
                },
            },
        });
    }

    public async create(data: Prisma.VocabMasteryCreateInput): Promise<VocabMastery> {
        return this.prisma.vocabMastery.create({
            data,
        });
    }

    public async update(id: string, data: Prisma.VocabMasteryUpdateInput): Promise<VocabMastery> {
        return this.prisma.vocabMastery.update({
            where: { id },
            data,
        });
    }

    public async createHistory(data: Prisma.VocabMasteryHistoryCreateInput): Promise<void> {
        await this.prisma.vocabMasteryHistory.create({
            data,
        });
    }

    public async aggregateByUserId(userId: string): Promise<{
        _count: { id: number };
        _sum: { correctCount: number | null; incorrectCount: number | null };
        _avg: { masteryScore: number | null };
    }> {
        return this.prisma.vocabMastery.aggregate({
            where: { userId },
            _count: { id: true },
            _sum: {
                correctCount: true,
                incorrectCount: true,
            },
            _avg: {
                masteryScore: true,
            },
        });
    }

    public async findLastPracticeAtByUserId(userId: string): Promise<{ createdAt: Date } | null> {
        return this.prisma.vocabMasteryHistory.findFirst({
            where: { vocabMastery: { userId } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
    }

    public async countHealthByUserId(userId: string): Promise<{ criticalCount: number; warningCount: number }> {
        const criticalThreshold = VOCAB_STATUS_THRESHOLDS.CRITICAL;
        const warningThreshold = VOCAB_STATUS_THRESHOLDS.WARNING;

        const rows = await this.prisma.$queryRaw<Array<{ criticalCount: number; warningCount: number }>>`
            SELECT
                COUNT(*) FILTER (
                    WHERE incorrect_count::float / (correct_count + incorrect_count) >= ${criticalThreshold}
                )::int AS "criticalCount",
                COUNT(*) FILTER (
                    WHERE incorrect_count::float / (correct_count + incorrect_count) >= ${warningThreshold}
                      AND incorrect_count::float / (correct_count + incorrect_count) < ${criticalThreshold}
                )::int AS "warningCount"
            FROM vocab_mastery
            WHERE user_id = ${userId}
              AND (correct_count + incorrect_count) > 0
        `;

        const row = rows[0];
        return {
            criticalCount: row?.criticalCount ?? 0,
            warningCount: row?.warningCount ?? 0,
        };
    }

    public async getMasteryBySubjectRaw(userId: string): Promise<
        Array<{
            subjectId: string;
            subjectName: string;
            averageMastery: number;
            vocabCount: number;
        }>
    > {
        return this.prisma.$queryRaw<
            Array<{
                subjectId: string;
                subjectName: string;
                averageMastery: number;
                vocabCount: number;
            }>
        >`
            SELECT 
                s.id as "subjectId",
                s.name as "subjectName",
                AVG(vm.mastery_score)::float as "averageMastery",
                COUNT(DISTINCT vm.vocab_id)::int as "vocabCount"
            FROM vocab_mastery vm
            INNER JOIN vocab v ON vm.vocab_id = v.id
            INNER JOIN text_target tt ON v.id = tt.vocab_id
            INNER JOIN text_target_subject tts ON tt.id = tts.text_target_id
            INNER JOIN subject s ON tts.subject_id = s.id
            WHERE vm.user_id = ${userId}
            GROUP BY s.id, s.name, s."order"
            ORDER BY s."order" ASC
        `;
    }

    public async getProgressOverTimeRaw(userId: string, startDate?: string, endDate?: string): Promise<Array<{ date: string; averageMastery: number; practiceCount: number }>> {
        const whereConditions: string[] = ['vm.user_id = $1'];
        const params: unknown[] = [userId];
        let paramIndex = 2;

        if (startDate) {
            whereConditions.push(`DATE(vmh.created_at) >= $${paramIndex}::date`);
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereConditions.push(`DATE(vmh.created_at) <= $${paramIndex}::date`);
            params.push(endDate);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        const sql = `
            SELECT 
                DATE(vmh.created_at)::text as date,
                AVG(vmh.mastery_score)::float as "averageMastery",
                COUNT(*)::int as "practiceCount"
            FROM vocab_mastery_history vmh
            INNER JOIN vocab_mastery vm ON vmh.vocab_mastery_id = vm.id
            WHERE ${whereClause}
            GROUP BY DATE(vmh.created_at)
            ORDER BY DATE(vmh.created_at) ASC
        `;

        return this.prisma.$queryRawUnsafe<Array<{ date: string; averageMastery: number; practiceCount: number }>>(sql, ...params);
    }

    public async findNeedsReviewVocabs(
        userId: string,
        status: 'critical' | 'warning' | 'all',
        limit: number,
        offset: number,
    ): Promise<
        Array<{
            vocabMasteryId: string;
            vocabId: string;
            correctCount: number;
            incorrectCount: number;
            masteryScore: number;
            errorRate: number;
            healthStatus: 'CRITICAL' | 'WARNING';
        }>
    > {
        const criticalThreshold = VOCAB_STATUS_THRESHOLDS.CRITICAL;
        const warningThreshold = VOCAB_STATUS_THRESHOLDS.WARNING;

        const statusCondition =
            status === 'critical'
                ? Prisma.sql`AND vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count) >= ${criticalThreshold}`
                : status === 'warning'
                  ? Prisma.sql`AND vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count) >= ${warningThreshold}
                      AND vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count) < ${criticalThreshold}`
                  : Prisma.sql`AND vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count) >= ${warningThreshold}`;

        return this.prisma.$queryRaw<
            Array<{
                vocabMasteryId: string;
                vocabId: string;
                correctCount: number;
                incorrectCount: number;
                masteryScore: number;
                errorRate: number;
                healthStatus: 'CRITICAL' | 'WARNING';
            }>
        >`
            SELECT
                vm.id AS "vocabMasteryId",
                vm.vocab_id AS "vocabId",
                vm.correct_count AS "correctCount",
                vm.incorrect_count AS "incorrectCount",
                vm.mastery_score AS "masteryScore",
                (vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count)) AS "errorRate",
                CASE
                    WHEN vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count) >= ${criticalThreshold} THEN 'CRITICAL'
                    ELSE 'WARNING'
                END AS "healthStatus"
            FROM vocab_mastery vm
            WHERE vm.user_id = ${userId}
              AND (vm.correct_count + vm.incorrect_count) > 0
              ${statusCondition}
            ORDER BY
                (vm.incorrect_count::float / (vm.correct_count + vm.incorrect_count)) DESC,
                vm.incorrect_count DESC
            LIMIT ${limit}
            OFFSET ${offset}
        `;
    }

    public async findVocabMasteriesWithVocabByIds(vocabMasteryIds: string[]): Promise<VocabMasteryWithVocab[]> {
        if (vocabMasteryIds.length === 0) {
            return [];
        }

        return this.prisma.vocabMastery.findMany({
            where: { id: { in: vocabMasteryIds } },
            include: {
                vocab: {
                    include: {
                        sourceLanguage: true,
                        targetLanguage: true,
                        textTargets: {
                            take: 1,
                        },
                    },
                },
            },
        });
    }

    public async getMasteryDistributionRaw(userId: string): Promise<
        Array<{
            scoreRange: string;
            count: number;
        }>
    > {
        return this.prisma.$queryRaw<
            Array<{
                scoreRange: string;
                count: number;
            }>
        >`
            SELECT 
                CASE 
                    WHEN mastery_score = 0 THEN '0'
                    WHEN mastery_score BETWEEN 1 AND 2 THEN '1-2'
                    WHEN mastery_score BETWEEN 3 AND 4 THEN '3-4'
                    WHEN mastery_score BETWEEN 5 AND 6 THEN '5-6'
                    WHEN mastery_score BETWEEN 7 AND 8 THEN '7-8'
                    WHEN mastery_score BETWEEN 9 AND 10 THEN '9-10'
                END as "scoreRange",
                COUNT(*)::int as count
            FROM vocab_mastery
            WHERE user_id = ${userId}
            GROUP BY 
                CASE 
                    WHEN mastery_score = 0 THEN '0'
                    WHEN mastery_score BETWEEN 1 AND 2 THEN '1-2'
                    WHEN mastery_score BETWEEN 3 AND 4 THEN '3-4'
                    WHEN mastery_score BETWEEN 5 AND 6 THEN '5-6'
                    WHEN mastery_score BETWEEN 7 AND 8 THEN '7-8'
                    WHEN mastery_score BETWEEN 9 AND 10 THEN '9-10'
                END
            ORDER BY MIN(mastery_score)
        `;
    }
}
