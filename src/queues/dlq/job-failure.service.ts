import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '@/shared';

@Injectable()
export class JobFailureService {
    public constructor(private readonly prisma: PrismaService) {}

    public async recordFinalFailure(job: Job, queueName: string): Promise<void> {
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < maxAttempts) {
            return;
        }

        const jobId = String(job.id ?? '');
        const stack = job.stacktrace;
        const stackTrace =
            Array.isArray(stack) && stack.length > 0 ? stack.join('\n') : null;

        await this.prisma.jobFailure.upsert({
            where: {
                queueName_jobId: { queueName, jobId },
            },
            create: {
                queueName,
                jobId,
                jobName: job.name ?? '',
                payload:
                    job.data === undefined ? {} : (job.data as object),
                error: job.failedReason ?? 'unknown',
                stackTrace,
                attemptsMade: job.attemptsMade,
                maxAttempts,
                failedAt: new Date(),
            },
            update: {},
        });
    }
}
