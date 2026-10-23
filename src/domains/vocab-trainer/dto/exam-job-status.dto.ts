import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const EXAM_JOB_STATUSES = ['evaluating', 'generating', 'completed', 'failed', 'unknown'] as const;

export type ExamJobStatus = (typeof EXAM_JOB_STATUSES)[number];

export class ExamJobStatusDto {
    @ApiProperty({ description: 'Job ID returned when the exam was submitted or generated' })
    public jobId: string;

    @ApiProperty({
        enum: EXAM_JOB_STATUSES,
        description: 'Same vocabulary as the *-progress socket events. `unknown` means the job is gone (expired) or does not belong to the caller.',
    })
    public status: ExamJobStatus;

    @ApiPropertyOptional({ description: 'Same payload the `completed` socket event carries (results, questions, transcript...)', type: Object })
    public data?: object;

    @ApiPropertyOptional({ description: 'Failure reason when status is `failed`' })
    public error?: string;

    public constructor(init: ExamJobStatusDto) {
        Object.assign(this, init);
    }
}
