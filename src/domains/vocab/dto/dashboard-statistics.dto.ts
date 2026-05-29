import { ApiProperty } from '@nestjs/swagger';
import { MasteryBySubjectDto, MasteryDistributionDto, MasterySummaryDto, ProgressOverTimeDto, TopProblematicVocabDto } from './vocab-mastery-statistics.dto';

type DashboardSummaryInput = ConstructorParameters<typeof MasterySummaryDto>[0];
type DashboardSubjectInput = ConstructorParameters<typeof MasteryBySubjectDto>[0];
type DashboardProblematicInput = ConstructorParameters<typeof TopProblematicVocabDto>[0];
type DashboardDistributionInput = ConstructorParameters<typeof MasteryDistributionDto>[0];
type DashboardProgressInput = ConstructorParameters<typeof ProgressOverTimeDto>[0];

export class DashboardStatisticsDto {
    @ApiProperty({ required: false, type: MasterySummaryDto })
    public summary?: MasterySummaryDto;

    @ApiProperty({ required: false, type: [MasteryBySubjectDto] })
    public subjects?: MasteryBySubjectDto[];

    @ApiProperty({ required: false, type: [TopProblematicVocabDto] })
    public problematic?: TopProblematicVocabDto[];

    @ApiProperty({ required: false, type: [MasteryDistributionDto] })
    public distribution?: MasteryDistributionDto[];

    @ApiProperty({ required: false, type: [ProgressOverTimeDto] })
    public progress?: ProgressOverTimeDto[];

    public constructor(data: {
        summary?: DashboardSummaryInput;
        subjects?: DashboardSubjectInput[];
        problematic?: DashboardProblematicInput[];
        distribution?: DashboardDistributionInput[];
        progress?: DashboardProgressInput[];
    }) {
        if (data.summary !== undefined) {
            this.summary = new MasterySummaryDto(data.summary);
        }
        if (data.subjects !== undefined) {
            this.subjects = data.subjects.map((subject) => new MasteryBySubjectDto(subject));
        }
        if (data.problematic !== undefined) {
            this.problematic = data.problematic.map((vocab) => new TopProblematicVocabDto(vocab));
        }
        if (data.distribution !== undefined) {
            this.distribution = data.distribution.map((bucket) => new MasteryDistributionDto(bucket));
        }
        if (data.progress !== undefined) {
            this.progress = data.progress.map((point) => new ProgressOverTimeDto(point));
        }
    }
}
