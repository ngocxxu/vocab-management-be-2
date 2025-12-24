import { Injectable, Logger } from '@nestjs/common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { VocabDto } from '../model';
import { VocabMasteryRepository } from '../repository';

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

    public constructor(private readonly vocabMasteryRepository: VocabMasteryRepository) {}

    public async getOrCreateMastery(vocabId: string, userId: string) {
        try {
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

            const updatedMastery = await this.vocabMasteryRepository.update(mastery.id, {
                masteryScore: newMasteryScore,
                correctCount: newCorrectCount,
                incorrectCount: newIncorrectCount,
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
            await this.vocabMasteryRepository.createHistory({
                vocabMastery: { connect: { id: vocabMasteryId } },
                masteryScore,
                correctCount,
                incorrectCount,
            });
        } catch (error: unknown) {
            this.logger.error('Failed to save mastery history', error);
        }
    }

    public async getSummary(userId: string) {
        try {
            const result = await this.vocabMasteryRepository.aggregateByUserId(userId);

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
            return await this.vocabMasteryRepository.getMasteryBySubjectRaw(userId);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getMasteryBySubject', this.errorMapping);
        }
    }

    public async getProgressOverTime(userId: string, startDate?: Date, endDate?: Date) {
        try {
            return await this.vocabMasteryRepository.getProgressOverTimeRaw(
                userId,
                startDate,
                endDate,
            );
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
            const vocabs = await this.vocabMasteryRepository.findTopProblematic(
                userId,
                minIncorrect,
                limit,
            );

            return vocabs.map((vm: any) => ({
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
            return await this.vocabMasteryRepository.getMasteryDistributionRaw(userId);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getMasteryDistribution', this.errorMapping);
        }
    }
}
