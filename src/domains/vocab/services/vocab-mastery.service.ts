import { Injectable } from '@nestjs/common';
import { VocabBadRequestException } from '../exceptions';
import { VocabDto } from '../dto';
import { VocabMasteryRepository, VocabMasteryWithVocab } from '../repositories';

@Injectable()
export class VocabMasteryService {
    public constructor(private readonly vocabMasteryRepository: VocabMasteryRepository) {}

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
    }

    public async saveHistory(
        vocabMasteryId: string,
        masteryScore: number,
        correctCount: number,
        incorrectCount: number,
    ) {
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
    }

    public async getMasteryBySubject(userId: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        return await this.vocabMasteryRepository.getMasteryBySubjectRaw(userId);
    }

    public async getProgressOverTime(userId: string, startDate?: Date, endDate?: Date) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        if (startDate && endDate && startDate > endDate) {
            throw new VocabBadRequestException('Start date must be before end date');
        }

        return await this.vocabMasteryRepository.getProgressOverTimeRaw(
            userId,
            startDate,
            endDate,
        );
    }

    public async getTopProblematicVocabs(
        userId: string,
        minIncorrect: number = 5,
        limit: number = 10,
    ) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        if (minIncorrect < 0) {
            throw new VocabBadRequestException('Minimum incorrect count must be non-negative');
        }

        if (limit <= 0 || limit > 100) {
            throw new VocabBadRequestException('Limit must be between 1 and 100');
        }

        const vocabs = await this.vocabMasteryRepository.findTopProblematic(
            userId,
            minIncorrect,
            limit,
        );

        return vocabs.map((vm: VocabMasteryWithVocab) => ({
            vocabId: vm.vocabId,
            vocab: new VocabDto(vm.vocab),
            incorrectCount: vm.incorrectCount,
            masteryScore: vm.masteryScore,
            correctCount: vm.correctCount,
        }));
    }

    public async getMasteryDistribution(userId: string) {
        if (!userId) {
            throw new VocabBadRequestException('User ID is required');
        }

        return await this.vocabMasteryRepository.getMasteryDistributionRaw(userId);
    }
}
