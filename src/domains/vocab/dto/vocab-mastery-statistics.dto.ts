import { ApiProperty } from '@nestjs/swagger';
import { VocabMasteryHealthStatus } from '../utils/vocab-mastery-status.util';
import { MasterySummaryTrendsDto } from './mastery-summary-trends.dto';
import { VocabDto } from './vocab.dto';

export class MasterySummaryDto {
    @ApiProperty({ description: "Total number of vocabs in the user's library", example: 120 })
    public totalVocabs: number;

    @ApiProperty({ description: 'Total number of correct answers', example: 340 })
    public totalCorrect: number;

    @ApiProperty({ description: 'Total number of incorrect answers', example: 60 })
    public totalIncorrect: number;

    @ApiProperty({ description: 'Average mastery score', example: 7.3 })
    public averageMastery: number;

    @ApiProperty({ description: 'Most recent practice timestamp', example: '2024-12-05T10:30:00.000Z', nullable: true })
    public lastPracticeAt: Date | null;

    @ApiProperty({ description: 'Vocabs with error rate at or above critical threshold', example: 12 })
    public criticalCount: number;

    @ApiProperty({ description: 'Vocabs with error rate at or above warning threshold but below critical', example: 8 })
    public warningCount: number;

    @ApiProperty({ description: 'Rolling 7-day dashboard trend deltas', type: MasterySummaryTrendsDto })
    public trends: MasterySummaryTrendsDto;

    public constructor(data: {
        totalVocabs: number;
        totalCorrect: number;
        totalIncorrect: number;
        averageMastery: number;
        lastPracticeAt: Date | null;
        criticalCount: number;
        warningCount: number;
        trends: ConstructorParameters<typeof MasterySummaryTrendsDto>[0];
    }) {
        this.totalVocabs = data.totalVocabs;
        this.totalCorrect = data.totalCorrect;
        this.totalIncorrect = data.totalIncorrect;
        this.averageMastery = Math.round(data.averageMastery * 10) / 10;
        this.lastPracticeAt = data.lastPracticeAt;
        this.criticalCount = data.criticalCount;
        this.warningCount = data.warningCount;
        this.trends = new MasterySummaryTrendsDto(data.trends);
    }
}

export class MasteryBySubjectDto {
    @ApiProperty({ description: 'Subject ID', example: 'subject-123' })
    public subjectId: string;

    @ApiProperty({ description: 'Subject name', example: 'Animals' })
    public subjectName: string;

    @ApiProperty({ description: 'Average mastery score for this subject', example: 7.5 })
    public averageMastery: number;

    @ApiProperty({ description: 'Number of vocabs in this subject', example: 25 })
    public vocabCount: number;

    public constructor(data: { subjectId: string; subjectName: string; averageMastery: number; vocabCount: number }) {
        this.subjectId = data.subjectId;
        this.subjectName = data.subjectName;
        this.averageMastery = Math.round(data.averageMastery * 10) / 10;
        this.vocabCount = data.vocabCount;
    }
}

export class ProgressOverTimeDto {
    @ApiProperty({ description: 'Date in YYYY-MM-DD format', example: '2024-12-05' })
    public date: string;

    @ApiProperty({ description: 'Average mastery score on this date', example: 7.2 })
    public averageMastery: number;

    @ApiProperty({ description: 'Number of mastery history events on this date', example: 12 })
    public practiceCount: number;

    public constructor(data: { date: string; averageMastery: number; practiceCount: number }) {
        this.date = data.date;
        this.averageMastery = Math.round(data.averageMastery * 10) / 10;
        this.practiceCount = data.practiceCount;
    }
}

export class TopProblematicVocabDto {
    @ApiProperty({ description: 'Vocab ID', example: 'vocab-123' })
    public vocabId: string;

    @ApiProperty({ description: 'Vocab details', type: VocabDto })
    public vocab: VocabDto;

    @ApiProperty({ description: 'Number of incorrect answers', example: 8 })
    public incorrectCount: number;

    @ApiProperty({ description: 'Current mastery score', example: 3.0 })
    public masteryScore: number;

    @ApiProperty({ description: 'Number of correct answers', example: 2 })
    public correctCount: number;

    @ApiProperty({ description: 'Error rate from 0 to 1', example: 0.625 })
    public errorRate: number;

    @ApiProperty({ description: 'Health status based on error rate thresholds', enum: ['CRITICAL', 'WARNING'], example: 'CRITICAL' })
    public healthStatus: VocabMasteryHealthStatus;

    public constructor(data: {
        vocabId: string;
        vocab: VocabDto;
        incorrectCount: number;
        masteryScore: number;
        correctCount: number;
        errorRate: number;
        healthStatus: 'CRITICAL' | 'WARNING';
    }) {
        this.vocabId = data.vocabId;
        this.vocab = data.vocab;
        this.incorrectCount = data.incorrectCount;
        this.masteryScore = data.masteryScore;
        this.correctCount = data.correctCount;
        this.errorRate = Math.round(data.errorRate * 1000) / 1000;
        this.healthStatus = data.healthStatus;
    }
}

export class MasteryDistributionDto {
    @ApiProperty({ description: 'Score range', example: '5-6' })
    public scoreRange: string;

    @ApiProperty({ description: 'Number of vocabs in this range', example: 25 })
    public count: number;

    public constructor(data: { scoreRange: string; count: number }) {
        this.scoreRange = data.scoreRange;
        this.count = data.count;
    }
}
