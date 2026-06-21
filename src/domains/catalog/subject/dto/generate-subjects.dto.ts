import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateSubjectsJobDto {
    @ApiProperty({ description: 'Job ID — use to correlate the incoming socket event subject-generate-result' })
    public readonly jobId: string;

    public constructor(jobId: string) {
        this.jobId = jobId;
    }
}

export class SubjectSuggestionDto {
    @ApiPropertyOptional({ description: 'Subject ID — present only when this suggestion matches an existing subject' })
    public readonly id?: string;

    @ApiProperty({ description: 'Subject name' })
    public readonly name: string;

    public constructor(data: { id?: string; name: string }) {
        this.id = data.id;
        this.name = data.name;
    }
}

export class GenerateSubjectsDto {
    @ApiProperty({ description: 'Total number of suggestions returned by AI' })
    public readonly totalCount: number;

    @ApiProperty({ description: 'Suggestions that match existing subjects (include id)', type: [SubjectSuggestionDto] })
    public readonly matchingExisting: SubjectSuggestionDto[];

    @ApiProperty({ description: 'Suggestions that do not exist yet (no id)', type: [SubjectSuggestionDto] })
    public readonly newCreativeIdeas: SubjectSuggestionDto[];

    public constructor(data: { matchingExisting: SubjectSuggestionDto[]; newCreativeIdeas: SubjectSuggestionDto[] }) {
        this.matchingExisting = data.matchingExisting;
        this.newCreativeIdeas = data.newCreativeIdeas;
        this.totalCount = data.matchingExisting.length + data.newCreativeIdeas.length;
    }
}
