import { InjectQueue } from '@nestjs/bull';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ReminderScheduleStatus } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { LoggerService } from '@/shared';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { ReminderScheduleEmailJobData } from '../../notification/email/utils/type';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { EReminderType } from '../utils';

@Injectable()
export class ReminderReconciliationService implements OnModuleInit, OnModuleDestroy {
    private timer?: NodeJS.Timeout;
    private stopped = false;

    public constructor(
        @InjectQueue(EReminderType.EMAIL_REMINDER) private readonly emailQueue: Queue,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly logger: LoggerService,
    ) {}

    public onModuleInit(): void {
        if (process.env.REMINDER_RECONCILIATION_ENABLED === 'false') {
            return;
        }
        this.timer = setInterval(() => {
            void this.run().catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.error(`Reminder reconciliation failed: ${msg}`);
            });
        }, REMINDER_CONFIG.reconciliation.intervalMs);
    }

    public onModuleDestroy(): void {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    private async run(): Promise<void> {
        if (this.stopped) {
            return;
        }
        const staleBefore = new Date(
            Date.now() - REMINDER_CONFIG.reconciliation.staleClaimedAfterMs,
        );
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
    }

    private async resetOrphanedQueued(): Promise<number> {
        const rows = await this.reminderScheduleRepository.findQueuedScheduleIds(50);
        let count = 0;
        for (const row of rows) {
            const job = (await this.emailQueue.getJob(
                `reminder-schedule-${row.id}`,
            )) as Job<ReminderScheduleEmailJobData>;

            if (!job) {
                const ok = await this.reminderScheduleRepository.transitionStatus(
                    row.id,
                    ReminderScheduleStatus.QUEUED,
                    ReminderScheduleStatus.PENDING,
                    { lockedBy: null, lockedAt: null },
                );
                if (ok) {
                    count += 1;
                }
            }
        }
        return count;
    }

    private async repairMissingEscalations(): Promise<void> {
        const threshold = new Date(
            Date.now() - REMINDER_CONFIG.reconciliation.missingEscalationAfterMs,
        );
        const candidates = await this.reminderScheduleRepository.findInitialSentRemindersBefore(
            threshold,
            20,
        );
        for (const initial of candidates) {
            const childCount = await this.reminderScheduleRepository.countEscalationsForInitial(
                initial.id,
            );
            if (childCount > 0) {
                continue;
            }
            if (!initial.sentAt) {
                continue;
            }
            if (initial.entityType === VOCAB_TRAINER_ENTITY && initial.entityId) {
                const vt = await this.vocabTrainerRepository.findLastExamSubmittedAt(
                    initial.entityId,
                );
                if (vt?.lastExamSubmittedAt && vt.lastExamSubmittedAt > initial.sentAt) {
                    continue;
                }
            }
            await this.reminderScheduleRepository.inTransaction(async (tx) => {
                await this.reminderScheduleRepository.createEscalationsForInitial(
                    tx,
                    initial,
                    initial.sentAt as Date,
                );
            });
            this.logger.info(`Reconciliation: backfilled escalations for initial ${initial.id}`);
        }
    }
}
