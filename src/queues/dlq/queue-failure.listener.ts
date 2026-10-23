import { captureSentryException, LoggerService } from '@/shared';
import { getQueueToken, InjectQueue } from '@nestjs/bull';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Job, Queue } from 'bull';
import { DEAD_LETTER_QUEUE_DEFAULT_OPTIONS } from '../config/queue.config';
import { DEAD_LETTER_QUEUE, JOB_NAMES, WORKLOAD_QUEUE_NAMES } from '../constants/queue.constants';
import { JobFailureService } from './job-failure.service';

type FailedHandler = (job: Job, error: Error) => void;

/**
 * Mirrors a job into the dead-letter queue (and `JobFailure` + Sentry) once it has failed for good.
 * Uses Bull's own `failed` event: the app runs Bull (`@nestjs/bull`), whose jobs never reach BullMQ's `QueueEvents` streams.
 */
@Injectable()
export class QueueFailureListener implements OnModuleInit, OnModuleDestroy {
    private readonly registrations: Array<{ queue: Queue; handler: FailedHandler }> = [];

    public constructor(
        private readonly moduleRef: ModuleRef,
        private readonly jobFailureService: JobFailureService,
        private readonly logger: LoggerService,
        @InjectQueue(DEAD_LETTER_QUEUE) private readonly deadLetterQueue: Queue,
    ) {}

    public onModuleInit(): void {
        for (const queueName of WORKLOAD_QUEUE_NAMES) {
            const queue = this.moduleRef.get<Queue>(getQueueToken(queueName), { strict: false });
            const handler: FailedHandler = (job) => {
                void this.handleFailed(job, queueName);
            };
            queue.on('failed', handler);
            this.registrations.push({ queue, handler });
        }
    }

    public onModuleDestroy(): void {
        for (const { queue, handler } of this.registrations) {
            queue.removeListener('failed', handler);
        }
        this.registrations.length = 0;
    }

    private async handleFailed(job: Job, queueName: string): Promise<void> {
        try {
            // Bull emits `failed` for every failed attempt. Only a job left in `failed` (retries exhausted or discarded) is final.
            if ((await job.getState()) !== 'failed') {
                return;
            }
            const maxAttempts = job.opts.attempts ?? 1;
            await this.jobFailureService.recordFinalFailure(job, queueName);
            this.captureFinalFailure(job, queueName, maxAttempts);
            await this.deadLetterQueue.add(
                JOB_NAMES.failedJobMirror,
                {
                    sourceQueue: queueName,
                    originalJobId: String(job.id ?? ''),
                    jobName: job.name,
                    payload: job.data as unknown,
                    error: job.failedReason,
                    attemptsMade: job.attemptsMade,
                    maxAttempts,
                },
                DEAD_LETTER_QUEUE_DEFAULT_OPTIONS,
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`QueueFailureListener(${queueName}): ${msg}`);
            captureSentryException(err, {
                tags: {
                    'queue.name': queueName,
                },
                contexts: {
                    queue_failure_listener: {
                        queueName,
                    },
                },
            });
        }
    }

    private captureFinalFailure(job: Job, queueName: string, maxAttempts: number): void {
        const jobId = String(job.id ?? '');
        const failedReason = job.failedReason ?? 'Bull job failed';
        const exception = new Error(failedReason);
        const stackTrace = Array.isArray(job.stacktrace) && job.stacktrace.length > 0 ? job.stacktrace.join('\n') : undefined;
        if (stackTrace) {
            exception.stack = stackTrace;
        }

        captureSentryException(exception, {
            tags: {
                'queue.name': queueName,
                'queue.job_name': job.name ?? '',
            },
            contexts: {
                queue_job: {
                    queueName,
                    jobId,
                    jobName: job.name ?? '',
                    attemptsMade: job.attemptsMade,
                    maxAttempts,
                },
            },
        });
    }
}
