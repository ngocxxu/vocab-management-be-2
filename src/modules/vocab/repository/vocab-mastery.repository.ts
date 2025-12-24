import { Injectable } from '@nestjs/common';
import { Prisma, VocabMastery } from '@prisma/client';
import { PrismaService } from '../../common';

@Injectable()
export class VocabMasteryRepository {
    public constructor(private readonly prismaService: PrismaService) {}

    public async findByVocabIdAndUserId(
        vocabId: string,
        userId: string,
    ): Promise<VocabMastery | null> {
        return this.prismaService.vocabMastery.findUnique({
            where: {
                vocabId_userId: {
                    vocabId,
                    userId,
                },
            },
        });
    }

    public async create(data: Prisma.VocabMasteryCreateInput): Promise<VocabMastery> {
        return this.prismaService.vocabMastery.create({
            data,
        });
    }

    public async update(id: string, data: Prisma.VocabMasteryUpdateInput): Promise<VocabMastery> {
        return this.prismaService.vocabMastery.update({
            where: { id },
            data,
        });
    }

    public async createHistory(data: Prisma.VocabMasteryHistoryCreateInput): Promise<void> {
        await this.prismaService.vocabMasteryHistory.create({
            data,
        });
    }

    public async aggregateByUserId(userId: string): Promise<{
        _count: { id: number };
        _sum: { correctCount: number | null; incorrectCount: number | null };
        _avg: { masteryScore: number | null };
    }> {
        return this.prismaService.vocabMastery.aggregate({
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

    public async getMasteryBySubjectRaw(userId: string): Promise<
        Array<{
            subjectId: string;
            subjectName: string;
            averageMastery: number;
            vocabCount: number;
        }>
    > {
        return this.prismaService.$queryRaw<
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

    public async getProgressOverTimeRaw(
        userId: string,
        startDate?: Date,
        endDate?: Date,
    ): Promise<Array<{ date: string; averageMastery: number }>> {
        const whereConditions: string[] = ['vm.user_id = $1'];
        const params: unknown[] = [userId];
        let paramIndex = 2;

        if (startDate) {
            whereConditions.push(`vmh.created_at >= $${paramIndex}`);
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereConditions.push(`vmh.created_at <= $${paramIndex}`);
            params.push(endDate);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        const sql = `
            SELECT 
                DATE(vmh.created_at)::text as date,
                AVG(vmh.mastery_score)::float as "averageMastery"
            FROM vocab_mastery_history vmh
            INNER JOIN vocab_mastery vm ON vmh.vocab_mastery_id = vm.id
            WHERE ${whereClause}
            GROUP BY DATE(vmh.created_at)
            ORDER BY DATE(vmh.created_at) ASC
        `;

        return this.prismaService.$queryRawUnsafe<Array<{ date: string; averageMastery: number }>>(
            sql,
            ...params,
        );
    }

    public async findTopProblematic(
        userId: string,
        minIncorrect: number,
        limit: number,
    ): Promise<VocabMastery[]> {
        return this.prismaService.vocabMastery.findMany({
            where: {
                userId,
                incorrectCount: {
                    gte: minIncorrect,
                },
            },
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
            orderBy: {
                incorrectCount: 'desc',
            },
            take: limit,
        });
    }

    public async getMasteryDistributionRaw(userId: string): Promise<
        Array<{
            scoreRange: string;
            count: number;
        }>
    > {
        return this.prismaService.$queryRaw<
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

