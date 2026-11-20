import { EmailReminderProducer } from '@/queues/producers/email-reminder.producer';
import { captureSentryException, LoggerService } from '@/shared';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReminderScheduleStatus } from '@prisma/client';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { EReminderType } from '../utils';
import { decideReminderRetry } from '../utils/reminder-retry.util';

// Bull states in which the job will still run, so its row is not orphaned.
// 'stuck' counts as live: Bull's stalled-job check decides what happens to it.
const LIVE_JOB_STATES = new Set<string>(['waiting', 'delayed', 'active', 'paused', 'stuck']);

@Injectable()
export class ReminderReconciliationService implements OnModuleDestroy {
    private stopped = false;
    // FSRS rows already reported as stuck in this process. A row leaves the set once it is no longer stuck.
    private readonly reportedStuckFsrs = new Set<string>();

    public constructor(
        private readonly emailReminderProducer: EmailReminderProducer,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly logger: LoggerService,
    ) {}

    @Interval('reminder-reconciliation', REMINDER_CONFIG.reconciliation.intervalMs)
    public async tick(): Promise<void> {
        if (process.env.REMINDER_RECONCILIATION_ENABLED === 'false') {
            return;
        }
        if (this.stopped) {
            return;
        }
        try {
            const now = new Date();
            const staleBefore = new Date(now.getTime() - REMINDER_CONFIG.reconciliation.staleClaimedAfterMs);
            const released = await this.reminderScheduleRepository.releaseStaleClaims(staleBefore);
            if (released > 0) {
                this.logger.info(`Reconciliation: released ${released} stale CLAIMED rows`);
            }

            const retried = await this.retryOrphanedQueued(now);
            if (retried > 0) {
                this.logger.info(`Reconciliation: retried ${retried} orphaned QUEUED rows`);
            }

            const resent = await this.retryStalledClassicSending(now);
            if (resent > 0) {
                this.logger.info(`Reconciliation: retried ${resent} stuck classic SENDING rows`);
            }

            await this.reportStuckFsrs(now);

            const collapsed = await this.reminderScheduleRepository.collapseOverdueEscalations();
            if (collapsed > 0) {
                this.logger.info(`Reconciliation: collapsed ${collapsed} overdue escalation rows`);
            }

            await this.repairMissingEscalations();
        } catch (err: unknown) {
            // @Interval does not await this method, so an uncaught rejection here
            // would be an unhandled rejection (fatal on Node >= 15) rather than a
            // log line.
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Reminder reconciliation failed: ${msg}`);
        }
    }

    public onModuleDestroy(): void {
        this.stopped = true;
    }

    /** A QUEUED row with no live Bull job never reached a worker, so it goes through the shared failure path. */
    private async retryOrphanedQueued(now: Date): Promise<number> {
        const olderThan = new Date(now.getTime() - REMINDER_CONFIG.reconciliation.orphanedQueuedAfterMs);
        const rows = await this.reminderScheduleRepository.findQueuedOlderThan(olderThan, 50);
        let count = 0;
        for (const row of rows) {
            if (await this.hasLiveJob(row.id)) {
                continue;
            }
            const decision = decideReminderRetry(row.attempt, now);
            const recorded = await this.reminderScheduleRepository.recordFailedAttempt(
                row.id,
                ReminderScheduleStatus.QUEUED,
                decision,
                'orphaned_queue',
                'Queued without a live job',
            );
            if (recorded) {
                count += 1;
                if (decision.terminal) {
                    this.logger.warn(`Reconciliation: schedule ${row.id} failed terminally after an orphaned QUEUED job`);
                }
            }
        }
        return count;
    }

    private async hasLiveJob(scheduleId: string): Promise<boolean> {
        const job = await this.emailReminderProducer.getReminderScheduleJob(scheduleId);
        if (!job) {
            return false;
        }

        return LIVE_JOB_STATES.has(await job.getState());
    }

    /** A classic row stuck in SENDING with no live job goes through the shared failure path. Its retry reuses the schedule id as the idempotency key. */
    private async retryStalledClassicSending(now: Date): Promise<number> {
        const olderThan = new Date(now.getTime() - REMINDER_CONFIG.reconciliation.stalledSendingAfterMs);
        const rows = await this.reminderScheduleRepository.findStalledClassicSending(olderThan, 50);
        let count = 0;
        for (const row of rows) {
            if (await this.hasLiveJob(row.id)) {
                continue;
            }
            const decision = decideReminderRetry(row.attempt, now);
            const recorded = await this.reminderScheduleRepository.recordFailedAttempt(
                row.id,
                ReminderScheduleStatus.SENDING,
                decision,
                'stuck_sending',
                'Stuck in SENDING without a live job',
            );
            if (recorded) {
                count += 1;
                if (decision.terminal) {
                    this.logger.warn(`Reconciliation: schedule ${row.id} failed terminally after a stuck SENDING row`);
                }
            }
        }
        return count;
    }

    /** An FSRS row stuck in SENDING is reported to Sentry once and left as it is. FSRS rows are never re-sent. */
    private async reportStuckFsrs(now: Date): Promise<void> {
        const olderThan = new Date(now.getTime() - REMINDER_CONFIG.reconciliation.stalledSendingAfterMs);
        const rows = await this.reminderScheduleRepository.findStalledFsrsSending(olderThan, 50);

        for (const row of rows) {
            if (this.reportedStuckFsrs.has(row.id)) {
                continue;
            }
            this.reportedStuckFsrs.add(row.id);
            this.logger.error(`Reconciliation: FSRS reminder ${row.id} stuck in SENDING; left unchanged`);
            captureSentryException(new Error(`FSRS reminder ${row.id} stuck in SENDING`), {
                tags: {
                    'queue.name': EReminderType.EMAIL_REMINDER,
                    'reminder.schedule_id': row.id,
                },
                contexts: {
                    reminder_stuck_sending: { scheduleId: row.id, template: row.template },
                },
            });
        }

        const stillStuck = new Set(rows.map((row) => row.id));
        for (const id of this.reportedStuckFsrs) {
            if (!stillStuck.has(id)) {
                this.reportedStuckFsrs.delete(id);
            }
        }
    }

    private async repairMissingEscalations(): Promise<void> {
        const threshold = new Date(Date.now() - REMINDER_CONFIG.reconciliation.missingEscalationAfterMs);
        const candidates = await this.reminderScheduleRepository.findInitialSentRemindersBefore(threshold, 20);
        for (const initial of candidates) {
            const childCount = await this.reminderScheduleRepository.countEscalationsForInitial(initial.id);
            if (childCount > 0) {
                continue;
            }
            if (!initial.sentAt) {
                continue;
            }
            if (initial.entityType === VOCAB_TRAINER_ENTITY && initial.entityId) {
                const vt = await this.vocabTrainerRepository.findLastExamSubmittedAt(initial.entityId);
                if (vt?.lastExamSubmittedAt && vt.lastExamSubmittedAt > initial.sentAt) {
                    continue;
                }
            }
            await this.reminderScheduleRepository.inTransaction(async (tx) => {
                await this.reminderScheduleRepository.createEscalationsForInitial(tx, initial, initial.sentAt as Date);
            });
            this.logger.info(`Reconciliation: backfilled escalations for initial ${initial.id}`);
        }
    }
}
