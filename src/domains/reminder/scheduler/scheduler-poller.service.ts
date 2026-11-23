import { EmailReminderProducer } from '@/queues/producers/email-reminder.producer';
import { LoggerService } from '@/shared';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReminderSchedule, ReminderScheduleStatus } from '@prisma/client';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class SchedulerPollerService implements OnModuleDestroy {
    private stopped = false;
    private processing = false;
    // HOSTNAME is the pod name, so two replicas never share a claim owner id.
    private readonly instanceId = process.env.INSTANCE_ID || process.env.HOSTNAME || `pid-${process.pid}`;

    public constructor(
        private readonly emailReminderProducer: EmailReminderProducer,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly logger: LoggerService,
    ) {}

    @Interval('reminder-scheduler-poller', REMINDER_CONFIG.poller.intervalMs)
    public async tick(): Promise<void> {
        if (process.env.REMINDER_POLLER_ENABLED === 'false') {
            return;
        }
        if (this.stopped || this.processing) {
            return;
        }
        this.processing = true;
        try {
            const batch = await this.reminderScheduleRepository.claimDueBatch(REMINDER_CONFIG.poller.batchSize, this.instanceId);
            for (const row of batch) {
                await this.enqueueOne(row);
            }
        } catch (err: unknown) {
            // @Interval does not await this method, so an uncaught rejection here
            // would be an unhandled rejection (fatal on Node >= 15) rather than a
            // log line. Same reasoning as the other two @Interval/@Cron methods.
            this.logger.error(`SchedulerPoller tick failed: ${errorMessage(err)}`);
        } finally {
            this.processing = false;
        }
    }

    public async onModuleDestroy(): Promise<void> {
        this.stopped = true;
        const deadline = Date.now() + REMINDER_CONFIG.poller.lockTimeoutMs;
        while (this.processing && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }

    /**
     * The row is marked QUEUED before the Bull job is added. If the mark fails, no job is added.
     * If adding the job fails, the row goes back to PENDING so the next tick can claim it again.
     */
    private async enqueueOne(row: ReminderSchedule): Promise<void> {
        try {
            const marked = await this.reminderScheduleRepository.transitionStatus(row.id, ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.QUEUED, {
                lockedBy: null,
                lockedAt: null,
            });
            if (!marked) {
                return;
            }
        } catch (err: unknown) {
            this.logger.error(`Poller could not mark schedule ${row.id} QUEUED: ${errorMessage(err)}`);
            return;
        }

        try {
            await this.removeFinishedJob(row.id);
            await this.emailReminderProducer.enqueueScheduleJobWithReturnJob(
                { scheduleId: row.id },
                {
                    jobId: `reminder-schedule-${row.id}`,
                    attempts: 1,
                    removeOnComplete: true,
                },
            );
        } catch (err: unknown) {
            this.logger.error(`Poller enqueue failed for schedule ${row.id}: ${errorMessage(err)}`);
            await this.revertToPending(row.id);
        }
    }

    /** Bull will not add a job whose id is already taken, even by a finished job. The finished one is removed first. */
    private async removeFinishedJob(scheduleId: string): Promise<void> {
        const existing = await this.emailReminderProducer.getReminderScheduleJob(scheduleId);
        if (!existing) {
            return;
        }

        const state = await existing.getState();
        if (state === 'failed' || state === 'completed') {
            await existing.remove();
        }
    }

    private async revertToPending(scheduleId: string): Promise<void> {
        try {
            await this.reminderScheduleRepository.transitionStatus(scheduleId, ReminderScheduleStatus.QUEUED, ReminderScheduleStatus.PENDING, {
                lockedBy: null,
                lockedAt: null,
            });
        } catch (err: unknown) {
            this.logger.error(`Poller could not revert schedule ${scheduleId} to PENDING: ${errorMessage(err)}`);
        }
    }
}
