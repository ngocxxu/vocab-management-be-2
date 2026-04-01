import { Process, Processor } from '@nestjs/bull';
import { ReminderScheduleKind, ReminderScheduleStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { LoggerService } from '../../common';
import { PrismaService } from '../../common/provider';
import { ActedCheckRegistry } from '../../reminder/acted-check/acted-check.registry';
import { REMINDER_CONFIG } from '../../reminder/config/reminder.config';
import { ReminderScheduleRepository } from '../../reminder/repository/reminder-schedule.repository';
import { EEmailReminderType, EReminderType } from '../../reminder/util';
import { computeBackoffMs } from '../../reminder/util/reminder-date.util';
import { EmailService } from '../service';
import { EmailJobData, ReminderScheduleEmailJobData, TemplateData } from '../util/type';

@Processor(EReminderType.EMAIL_REMINDER)
export class EmailProcessor {
    public constructor(
        private readonly emailService: EmailService,
        private readonly logger: LoggerService,
        private readonly prisma: PrismaService,
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
        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.reminderSchedule.updateMany({
                where: {
                    id: fresh.id,
                    status: ReminderScheduleStatus.SENDING,
                },
                data: {
                    status: ReminderScheduleStatus.SENT,
                    sentAt,
                    completedAt: sentAt,
                    attempt: { increment: 1 },
                },
            });
            if (updated.count !== 1) {
                return;
            }
            if (fresh.reminderType === ReminderScheduleKind.INITIAL) {
                const initial = await tx.reminderSchedule.findUnique({ where: { id: fresh.id } });
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
        await this.prisma.reminderSchedule.updateMany({
            where: { id: scheduleId, status: ReminderScheduleStatus.SENDING },
            data: {
                status: ReminderScheduleStatus.PENDING,
                attempt: nextAttempt,
                nextAttemptAt: nextAt,
                lastErrorCode: code ?? 'retryable',
                lastErrorMsg: msg,
                lockedBy: null,
                lockedAt: null,
            },
        });
    }
}
