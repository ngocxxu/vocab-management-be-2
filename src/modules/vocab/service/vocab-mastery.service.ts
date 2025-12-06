import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { VocabDto } from '../model';

@Injectable()
export class VocabMasteryService {
    private readonly logger = new Logger(VocabMasteryService.name);

    private readonly errorMapping = {
        P2002: 'Vocab mastery already exists for this vocab and user',
        P2025: {
            update: 'Vocab mastery not found',
            findOne: 'Vocab mastery not found',
        },
        P2003: 'Invalid vocab ID or user ID provided',
    };

    public constructor(private readonly prismaService: PrismaService) {}

    public async getOrCreateMastery(vocabId: string, userId: string) {
        try {
            let mastery = await this.prismaService.vocabMastery.findUnique({
                where: {
                    vocabId_userId: {
                        vocabId,
                        userId,
                    },
                },
            });

            if (!mastery) {
                mastery = await this.prismaService.vocabMastery.create({
                    data: {
                        vocabId,
                        userId,
                        masteryScore: 0,
                        correctCount: 0,
                        incorrectCount: 0,
                    },
                });
            }

            return mastery;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getOrCreateMastery', this.errorMapping);
        }
    }

    public async updateMastery(vocabId: string, userId: string, isCorrect: boolean) {
        try {
            const mastery = await this.getOrCreateMastery(vocabId, userId);

            const newCorrectCount = isCorrect ? mastery.correctCount + 1 : mastery.correctCount;
            const newIncorrectCount = isCorrect
                ? mastery.incorrectCount
                : mastery.incorrectCount + 1;
            const newMasteryScore = isCorrect
                ? Math.min(10, mastery.masteryScore + 1)
                : Math.max(0, mastery.masteryScore - 1);

            const updatedMastery = await this.prismaService.vocabMastery.update({
                where: {
                    id: mastery.id,
                },
                data: {
                    masteryScore: newMasteryScore,
                    correctCount: newCorrectCount,
                    incorrectCount: newIncorrectCount,
                },
            });

            await this.saveHistory(mastery.id, newMasteryScore, newCorrectCount, newIncorrectCount);

            return updatedMastery;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'updateMastery', this.errorMapping);
        }
    }

    public async saveHistory(
        vocabMasteryId: string,
        masteryScore: number,
        correctCount: number,
        incorrectCount: number,
    ) {
        try {
            await this.prismaService.vocabMasteryHistory.create({
                data: {
                    vocabMasteryId,
                    masteryScore,
                    correctCount,
                    incorrectCount,
                },
            });
        } catch (error: unknown) {
            this.logger.error('Failed to save mastery history', error);
        }
    }

    public async getSummary(userId: string) {
        try {
            const result = await this.prismaService.vocabMastery.aggregate({
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

            // eslint-disable-next-line no-underscore-dangle
            const count = result._count;
            // eslint-disable-next-line no-underscore-dangle
            const sum = result._sum;
            // eslint-disable-next-line no-underscore-dangle
            const avg = result._avg;

            return {
                totalVocabs: count.id,
                totalCorrect: sum.correctCount || 0,
                totalIncorrect: sum.incorrectCount || 0,
                averageMastery: avg.masteryScore || 0,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getSummary', this.errorMapping);
        }
    }

    public async getMasteryBySubject(userId: string) {
        try {
            const result = await this.prismaService.$queryRaw<
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

            return result;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getMasteryBySubject', this.errorMapping);
        }
    }

    public async getProgressOverTime(userId: string, startDate?: Date, endDate?: Date) {
        try {
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

            const result = await this.prismaService.$queryRawUnsafe<
                Array<{ date: string; averageMastery: number }>
            >(sql, ...params);

            return result;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getProgressOverTime', this.errorMapping);
        }
    }

    public async getTopProblematicVocabs(
        userId: string,
        minIncorrect: number = 5,
        limit: number = 10,
    ) {
        try {
            const vocabs = await this.prismaService.vocabMastery.findMany({
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

            return vocabs.map((vm) => ({
                vocabId: vm.vocabId,
                vocab: new VocabDto(vm.vocab),
                incorrectCount: vm.incorrectCount,
                masteryScore: vm.masteryScore,
                correctCount: vm.correctCount,
            }));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getTopProblematicVocabs', this.errorMapping);
        }
    }

    public async getMasteryDistribution(userId: string) {
        try {
            const result = await this.prismaService.$queryRaw<
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

            return result;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getMasteryDistribution', this.errorMapping);
        }
    }
}
