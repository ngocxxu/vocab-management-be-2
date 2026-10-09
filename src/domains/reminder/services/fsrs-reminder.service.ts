import { ConfigService } from '@/domains/platform/config/services/config.service';
import { FsrsMapper } from '@/domains/vocab/mappers/fsrs.mapper';
import { FsrsRepository } from '@/domains/vocab/repositories/fsrs.repository';
import { FsrsSessionService } from '@/domains/vocab/services/fsrs-session.service';
import { FsrsService } from '@/domains/vocab/services/fsrs.service';
import { endOfLocalDay, localDateLabel, resolveTimezone, SRS_TIMEZONE_CONFIG_KEY, startOfLocalDay } from '@/domains/vocab/utils/fsrs-local-day.util';
import { LoggerService } from '@/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReminderChannel, ReminderSchedule, ReminderScheduleKind, ReminderScheduleStatus, TrainerMode } from '@prisma/client';
import { TemplateData } from '../../notification/email/utils/type';
import { REMINDER_CONFIG } from '../config/reminder.config';
import { ReminderScheduleRepository } from '../repositories/reminder-schedule.repository';
import { ActedCheckRegistry } from '../strategies/acted-check.registry';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { EEmailTemplate } from '../utils';
import { buildReminderDedupeKey } from '../utils/reminder-dedupe-key.util';

const MS_PER_HOUR = 60 * 60 * 1000;

export type FsrsReminderSend = { send: true; data: TemplateData } | { send: false; reason: string };

/**
 * The email for an FSRS trainer that has work due: one per trainer per local day. Cards are scheduled one by one, so the
 * reminder is placed on the next morning on which something is due, and the numbers in it are counted when it is sent.
 */
@Injectable()
export class FsrsReminderService {
    private readonly fsrsMapper = new FsrsMapper();

    public constructor(
        private readonly fsrsRepository: FsrsRepository,
        private readonly fsrsService: FsrsService,
        private readonly fsrsSessionService: FsrsSessionService,
        private readonly reminderScheduleRepository: ReminderScheduleRepository,
        private readonly actedCheckRegistry: ActedCheckRegistry,
        private readonly configService: ConfigService,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Keeps one pending reminder for the trainer, on the next morning something is due; none when the cycle has ended, reminders are
     * off, there is nothing to learn or the last reminders were all ignored. Never throws: a review must not fail because of an email.
     */
    public async sync(userId: string, trainerId: string, now: Date = new Date()): Promise<void> {
        try {
            await this.syncOrThrow(userId, trainerId, now);
        } catch (error: unknown) {
            this.logger.error(`FSRS reminder sync failed for trainer ${trainerId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async cancelForTrainer(trainerId: string, reason: string): Promise<void> {
        await this.reminderScheduleRepository.cancelActiveExcept(VOCAB_TRAINER_ENTITY, trainerId, EEmailTemplate.FSRS_DUE_REMINDER, null, reason);
    }

    /** Counts what is due now. `send: false` (with the reason) when there is nothing to send, so the email is skipped. */
    public async prepareSend(row: ReminderSchedule, now: Date = new Date()): Promise<FsrsReminderSend> {
        if (!row.userId || !row.entityId) {
            return { send: false, reason: 'missing_entity' };
        }

        const trainer = await this.fsrsRepository.findTrainerOf(row.userId, row.entityId);
        if (!trainer || trainer.mode !== TrainerMode.FSRS) {
            return { send: false, reason: 'trainer_gone' };
        }
        if (trainer.reminderDisabled) {
            return { send: false, reason: 'reminder_disabled' };
        }

        try {
            const summary = await this.fsrsSessionService.getSummary(row.userId, row.entityId, now);
            if (summary.ended) {
                return { send: false, reason: 'cycle_ended' };
            }

            const reviewCount = summary.overdue + summary.dueToday;
            if (reviewCount + summary.newAvailable === 0) {
                return { send: false, reason: 'nothing_due' };
            }

            const payload = row.payload as TemplateData;

            return {
                send: true,
                data: {
                    firstName: payload.firstName,
                    lastName: payload.lastName,
                    trainerName: trainer.name,
                    reviewCount,
                    newCount: summary.newAvailable,
                    reviewUrl: this.reviewUrl(trainer.id),
                },
            };
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                return { send: false, reason: 'trainer_gone' };
            }
            throw error;
        }
    }

    private async syncOrThrow(userId: string, trainerId: string, now: Date): Promise<void> {
        const trainer = await this.fsrsRepository.findTrainerOf(userId, trainerId);
        if (!trainer || trainer.mode !== TrainerMode.FSRS) {
            return;
        }

        const settings = this.fsrsMapper.toSettings(trainer);
        if (trainer.reminderDisabled || this.fsrsService.isCycleEnded(settings, now) || (await this.isStopped(trainer.id))) {
            await this.cancelForTrainer(trainer.id, 'no_reminder_needed');
            return;
        }

        const timeZone = resolveTimezone(await this.configService.getConfig(userId, SRS_TIMEZONE_CONFIG_KEY));
        const sendAt = await this.nextSendAt(trainer.id, now, timeZone);
        if (!sendAt) {
            await this.cancelForTrainer(trainer.id, 'nothing_to_learn');
            return;
        }

        const dedupeKey = buildReminderDedupeKey.vocabTrainerFsrsDaily(trainer.id, localDateLabel(sendAt, timeZone));
        await this.reminderScheduleRepository.cancelActiveExcept(VOCAB_TRAINER_ENTITY, trainer.id, EEmailTemplate.FSRS_DUE_REMINDER, dedupeKey, 'rescheduled');

        const contact = await this.reminderScheduleRepository.findUserContact(userId);
        if (!contact) {
            return;
        }

        try {
            await this.reminderScheduleRepository.createSchedule({
                dedupeKey,
                channel: ReminderChannel.EMAIL,
                recipient: contact.email,
                template: EEmailTemplate.FSRS_DUE_REMINDER,
                payload: { firstName: contact.firstName, lastName: contact.lastName },
                dueAt: sendAt,
                userId,
                entityType: VOCAB_TRAINER_ENTITY,
                entityId: trainer.id,
                reminderType: ReminderScheduleKind.INITIAL,
                status: ReminderScheduleStatus.PENDING,
            });
        } catch (error: unknown) {
            // The reminder of that day exists already (pending, or sent earlier today).
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return;
            }
            throw error;
        }
    }

    /** The morning of the next review day on which a card is due, or new words are ready; null when there is nothing left to learn. */
    private async nextSendAt(trainerId: string, now: Date, timeZone: string): Promise<Date | null> {
        const tomorrow = endOfLocalDay(now, timeZone);
        const [earliestDue, newCards] = await Promise.all([this.fsrsRepository.findEarliestReviewDue(trainerId), this.fsrsRepository.countNewCards(trainerId)]);

        // Whatever is due or new today and is not done yet is still waiting tomorrow.
        const dueDay = newCards > 0 || (earliestDue !== null && earliestDue < tomorrow) ? tomorrow : earliestDue;
        if (!dueDay) {
            return null;
        }

        return new Date(startOfLocalDay(dueDay, timeZone).getTime() + REMINDER_CONFIG.fsrs.sendHoursAfterDayStart * MS_PER_HOUR);
    }

    /** True when the last reminders in a row were all sent without a single review after them. */
    private async isStopped(trainerId: string): Promise<boolean> {
        const limit = REMINDER_CONFIG.fsrs.maxIgnoredInRow;
        const sent = await this.reminderScheduleRepository.findLatestSent(VOCAB_TRAINER_ENTITY, trainerId, EEmailTemplate.FSRS_DUE_REMINDER, limit);
        const oldest = sent[sent.length - 1];
        if (sent.length < limit || !oldest?.sentAt) {
            return false;
        }

        return !(await this.actedCheckRegistry.hasActedSince(VOCAB_TRAINER_ENTITY, trainerId, oldest.sentAt));
    }

    private reviewUrl(trainerId: string): string {
        return `${process.env.FRONTEND_URL}/vocab-trainer/${trainerId}/review`;
    }
}
