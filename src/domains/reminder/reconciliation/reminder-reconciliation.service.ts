import type { ReminderScheduleEmailJobData } from '@/queues/interfaces/job-payloads';
import { EmailReminderProducer } from '@/queues/producers/email-reminder.producer';
import { LoggerService } from '@/shared';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ReminderScheduleStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
@Injectable()
export class ReminderReconciliationService implements OnModuleDestroy {
    private stopped = false;

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
            const staleBefore = new Date(Date.now() - REMINDER_CONFIG.reconciliation.staleClaimedAfterMs);
            const released = await this.reminderScheduleRepository.releaseStaleClaims(staleBefore);
            if (released > 0) {
                this.logger.info(`Reconciliation: released ${released} stale CLAIMED rows`);
            }

            const orphanedReset = await this.resetOrphanedQueued();
            if (orphanedReset > 0) {
                this.logger.info(`Reconciliation: reset ${orphanedReset} orphaned QUEUED rows`);
            }

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

    private async resetOrphanedQueued(): Promise<number> {
        const rows = await this.reminderScheduleRepository.findQueuedScheduleIds(50);
        let count = 0;
        for (const row of rows) {
            const job = (await this.emailReminderProducer.getReminderScheduleJob(row.id)) as Job<ReminderScheduleEmailJobData> | undefined;

            if (!job) {
                const ok = await this.reminderScheduleRepository.transitionStatus(row.id, ReminderScheduleStatus.QUEUED, ReminderScheduleStatus.PENDING, {
                    lockedBy: null,
                    lockedAt: null,
                });
                if (ok) {
                    count += 1;
                }
            }
        }
        return count;
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
