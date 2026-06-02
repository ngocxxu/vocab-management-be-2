import { ApiProperty } from '@nestjs/swagger';

export class MasterySummaryTrendsDto {
    @ApiProperty({ description: 'Percentage growth in total vocabs compared with 7 days ago', example: 12, nullable: true })
    public totalVocabsPercentDelta: number | null;

    @ApiProperty({ description: 'Average mastery score change compared with 7 days ago', example: -0.2, nullable: true })
    public averageMasteryDelta: number | null;

    @ApiProperty({ description: 'Accuracy percentage-point change compared with 7 days ago', example: 5, nullable: true })
    public accuracyPercentDelta: number | null;

    @ApiProperty({ description: 'Needs-review vocab count change compared with 7 days ago', example: -2, nullable: true })
    public needReviewDelta: number | null;

    public constructor(data: { totalVocabsPercentDelta: number | null; averageMasteryDelta: number | null; accuracyPercentDelta: number | null; needReviewDelta: number | null }) {
        this.totalVocabsPercentDelta = data.totalVocabsPercentDelta;
        this.averageMasteryDelta = data.averageMasteryDelta;
        this.accuracyPercentDelta = data.accuracyPercentDelta;
        this.needReviewDelta = data.needReviewDelta;
    }
}
