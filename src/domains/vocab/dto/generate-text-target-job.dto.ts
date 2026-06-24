import { ApiProperty } from '@nestjs/swagger';

export class GenerateTextTargetJobDto {
    @ApiProperty({ description: 'Job ID — correlate with socket event vocab-generate-text-target-result' })
    public readonly jobId: string;

    public constructor(jobId: string) {
        this.jobId = jobId;
    }
}
