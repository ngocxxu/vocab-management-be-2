import { EReminderType } from '@/domains/reminder/utils';
import { LoggerService } from '@/shared';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { DEAD_LETTER_QUEUE_DEFAULT_OPTIONS } from '../config/queue.config';
import { DEAD_LETTER_QUEUE, JOB_NAMES, WORKLOAD_QUEUE_NAMES } from '../constants/queue.constants';
import { JobFailureService } from './job-failure.service';

@Injectable()
export class QueueFailureListener implements OnModuleInit, OnModuleDestroy {
    private readonly queueEventsInstances: QueueEvents[] = [];
    private readonly queueByName = new Map<string, Queue>();

    public constructor(
        private readonly config: ConfigService,
        private readonly jobFailureService: JobFailureService,
        private readonly logger: LoggerService,
        @InjectQueue(DEAD_LETTER_QUEUE) private readonly deadLetterQueue: Queue,
        @InjectQueue(EReminderType.AUDIO_EVALUATION) qAudio: Queue,
        @InjectQueue(EReminderType.MULTIPLE_CHOICE_GENERATION) qMultipleChoice: Queue,
        @InjectQueue(EReminderType.FILL_IN_BLANK_EVALUATION) qFillInBlank: Queue,
        @InjectQueue(EReminderType.VOCAB_TRANSLATION) qVocab: Queue,
        @InjectQueue(EReminderType.EMAIL_REMINDER) qEmail: Queue,
        @InjectQueue(EReminderType.NOTIFICATION) qNotification: Queue,
        @InjectQueue(EReminderType.NOTIFICATION_FCM) qFcm: Queue,
    ) {
        const pairs: Array<[EReminderType, Queue]> = [
            [EReminderType.AUDIO_EVALUATION, qAudio],
            [EReminderType.MULTIPLE_CHOICE_GENERATION, qMultipleChoice],
            [EReminderType.FILL_IN_BLANK_EVALUATION, qFillInBlank],
            [EReminderType.VOCAB_TRANSLATION, qVocab],
            [EReminderType.EMAIL_REMINDER, qEmail],
            [EReminderType.NOTIFICATION, qNotification],
            [EReminderType.NOTIFICATION_FCM, qFcm],
        ];
        for (const [name, q] of pairs) {
            this.queueByName.set(name, q);
        }
    }

    public onModuleInit(): void {
        const connection = this.config.getOrThrow<string>('redis.url');
        for (const queueName of WORKLOAD_QUEUE_NAMES) {
            const queue = this.queueByName.get(queueName);
            if (!queue) {
                continue;
            }
            const queueEvents = new QueueEvents(queueName, {
                connection: { url: connection },
            });
            this.queueEventsInstances.push(queueEvents);

            const handler = async ({ jobId }: { jobId: string }): Promise<void> => {
                try {
                    const job = (await queue.getJob(jobId)) as Job | undefined;
                    if (!job) {
                        return;
                    }
                    const maxAttempts = job.opts.attempts ?? 1;
                    if (job.attemptsMade < maxAttempts) {
                        return;
                    }
                    await this.jobFailureService.recordFinalFailure(job, queueName);
                    await this.deadLetterQueue.add(
                        JOB_NAMES.failedJobMirror,
                        {
                            sourceQueue: queueName,
                            originalJobId: jobId,
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
                }
            };

            void queueEvents.waitUntilReady().then(() => {
                queueEvents.on('failed', handler);
            });
        }
    }

    public async onModuleDestroy(): Promise<void> {
        await Promise.all(this.queueEventsInstances.map(async (qe) => qe.close()));
    }
}
