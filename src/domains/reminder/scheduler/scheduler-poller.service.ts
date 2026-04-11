import { EmailReminderProducer } from '@/queues/producers/email-reminder.producer';
import { LoggerService } from '@/shared';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ReminderSchedule, ReminderScheduleStatus } from '@prisma/client';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
@Injectable()
export class SchedulerPollerService implements OnModuleInit, OnModuleDestroy {
    private timer?: NodeJS.Timeout;
    private stopped = false;
    private processing = false;
    private readonly instanceId = process.env.INSTANCE_ID ?? `pid-${process.pid}`;

    public constructor(
        private readonly emailReminderProducer: EmailReminderProducer,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly logger: LoggerService,
    ) {}

    public onModuleInit(): void {
        if (process.env.REMINDER_POLLER_ENABLED === 'false') {
            return;
        }
        this.timer = setInterval(() => {
            void this.tick().catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.error(`SchedulerPoller tick failed: ${msg}`);
            });
        }, REMINDER_CONFIG.poller.intervalMs);
    }

    public async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
        }
        const deadline = Date.now() + REMINDER_CONFIG.poller.lockTimeoutMs;
        while (this.processing && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }

    private async tick(): Promise<void> {
        if (this.stopped || this.processing) {
            return;
        }
        this.processing = true;
        try {
            const batch = await this.reminderScheduleRepository.claimDueBatch(REMINDER_CONFIG.poller.batchSize, this.instanceId);
            for (const row of batch) {
                await this.enqueueOne(row);
            }
        } finally {
            this.processing = false;
        }
    }

    private async enqueueOne(row: ReminderSchedule): Promise<void> {
        let job: { remove: () => Promise<void> } | undefined;
        try {
            job = await this.emailReminderProducer.enqueueScheduleJobWithReturnJob(
                { scheduleId: row.id },
                {
                    jobId: `reminder-schedule-${row.id}`,
                    attempts: 1,
                    removeOnComplete: true,
                },
            );
            const migrated = await this.reminderScheduleRepository.transitionStatus(row.id, ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.QUEUED, {
                lockedBy: null,
                lockedAt: null,
            });
            if (!migrated && job) {
                await job.remove();
                this.logger.warn(`Poller: stale claim for schedule ${row.id}, removed duplicate job`);
            }
        } catch (err: unknown) {
            if (job) {
                try {
                    await job.remove();
                } catch {
                    /* ignore */
                }
            }
            await this.reminderScheduleRepository.transitionStatus(row.id, ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.PENDING, { lockedBy: null, lockedAt: null });
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Poller enqueue failed for schedule ${row.id}: ${msg}`);
        }
    }
}
