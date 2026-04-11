import { Process, Processor } from '@nestjs/bull';
import { ReminderScheduleKind, ReminderScheduleStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { LoggerService } from '../../shared';
import { ActedCheckRegistry } from '../../reminder/strategies/acted-check.registry';
import { REMINDER_CONFIG } from '../../reminder/config/reminder.config';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { EEmailReminderType, EReminderType } from '../../reminder/utils';
import { computeBackoffMs } from '../../reminder/utils/reminder-date.util';
import { EmailService } from '../services';
import { EmailJobData, ReminderScheduleEmailJobData, TemplateData } from '../utils/type';

@Processor(EReminderType.EMAIL_REMINDER)
export class EmailProcessor {
    public constructor(
        private readonly emailService: EmailService,
        private readonly logger: LoggerService,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly actedCheckRegistry: ActedCheckRegistry,
    ) {}

    @Process(EEmailReminderType.SEND_REMINDER)
    public async handleReminderEmail(job: Job<EmailJobData>) {
        const { userEmail, reminderType, templateName, data } = job.data;

        try {
            await this.emailService.sendReminderEmail(userEmail, reminderType, templateName, data);
            this.logger.info(
                `Email sent successfully to ${userEmail} with reminder type: ${reminderType}`,
            );
        } catch (error) {
            this.logger.error(`Failed to send email: ${error}`);
            throw error;
        }
    }

    @Process(EEmailReminderType.SEND_REMINDER_SCHEDULE)
    public async handleReminderScheduleEmail(job: Job<ReminderScheduleEmailJobData>) {
        const { scheduleId } = job.data;
        const row = await this.reminderScheduleRepository.findById(scheduleId);
        if (!row) {
            this.logger.warn(`Reminder schedule ${scheduleId} not found`);
            return;
        }

        if (
            row.status !== ReminderScheduleStatus.QUEUED &&
            row.status !== ReminderScheduleStatus.PENDING
        ) {
            if (
                row.status === ReminderScheduleStatus.SENT ||
                row.status === ReminderScheduleStatus.CANCELLED ||
                row.status === ReminderScheduleStatus.EXPIRED
            ) {
                return;
            }
            this.logger.warn(
                `Reminder schedule ${scheduleId} unexpected status ${row.status}, skipping`,
            );
            return;
        }

        if (row.status === ReminderScheduleStatus.PENDING) {
            const moved = await this.reminderScheduleRepository.transitionStatus(
                row.id,
                ReminderScheduleStatus.PENDING,
                ReminderScheduleStatus.QUEUED,
            );
            if (!moved) {
                return;
            }
        }

        const casOk = await this.reminderScheduleRepository.transitionStatus(
            row.id,
            ReminderScheduleStatus.QUEUED,
            ReminderScheduleStatus.SENDING,
        );
        if (!casOk) {
            return;
        }

        const fresh = await this.reminderScheduleRepository.findById(scheduleId);
        if (!fresh) {
            return;
        }

        if (fresh.reminderType === ReminderScheduleKind.ESCALATION && fresh.actedCheckAfter) {
            const acted = await this.actedCheckRegistry.hasActedSince(
                fresh.entityType,
                fresh.entityId,
                fresh.actedCheckAfter,
            );
            if (acted) {
                if (fresh.initialReminderId) {
                    await this.reminderScheduleRepository.cancelSiblingEscalations(
                        fresh.initialReminderId,
                        fresh.id,
                    );
                }
                await this.reminderScheduleRepository.transitionStatus(
                    fresh.id,
                    ReminderScheduleStatus.SENDING,
                    ReminderScheduleStatus.CANCELLED,
                    {
                        cancelledAt: new Date(),
                        cancelledBy: 'system',
                        cancelReason: 'user_acted_before_send',
                        completedAt: new Date(),
                    },
                );
                return;
            }
        }

        const data = fresh.payload as TemplateData;
        const reminderTitle = 'Vocab Trainer';

        try {
            await this.emailService.sendReminderEmail(
                fresh.recipient,
                reminderTitle,
                fresh.template,
                data,
            );
        } catch (error: unknown) {
            await this.handleSendFailure(fresh.id, fresh.attempt, error);
            return;
        }

        const sentAt = new Date();
        await this.reminderScheduleRepository.inTransaction(async (tx) => {
            const updatedCount = await this.reminderScheduleRepository.markSentIfStillSending(
                tx,
                fresh.id,
                sentAt,
            );
            if (updatedCount !== 1) {
                return;
            }
            if (fresh.reminderType === ReminderScheduleKind.INITIAL) {
                const initial = await this.reminderScheduleRepository.findByIdWithClient(
                    tx,
                    fresh.id,
                );
                if (initial) {
                    await this.reminderScheduleRepository.createEscalationsForInitial(
                        tx,
                        initial,
                        sentAt,
                    );
                }
            }
        });
    }

    private async handleSendFailure(
        scheduleId: string,
        attempt: number,
        error: unknown,
    ): Promise<void> {
        const msg = error instanceof Error ? error.message : String(error);
        const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
        const nextAttempt = attempt + 1;
        const terminal =
            nextAttempt >= REMINDER_CONFIG.retry.maxAttempts ||
            code === 'EENVELOPE' ||
            /invalid|recipient/i.test(msg);

        if (terminal) {
            await this.reminderScheduleRepository.transitionStatus(
                scheduleId,
                ReminderScheduleStatus.SENDING,
                ReminderScheduleStatus.FAILED_TERMINAL,
                {
                    lastErrorCode: code ?? 'send_failed',
                    lastErrorMsg: msg,
                    completedAt: new Date(),
                },
            );
            this.logger.error(`Reminder ${scheduleId} terminal failure: ${msg}`);
            return;
        }

        const backoff = computeBackoffMs(nextAttempt);
        const nextAt = new Date(Date.now() + backoff);
        await this.reminderScheduleRepository.resetSendingToPendingRetry(
            scheduleId,
            nextAttempt,
            nextAt,
            code ?? 'retryable',
            msg,
        );
    }
}
