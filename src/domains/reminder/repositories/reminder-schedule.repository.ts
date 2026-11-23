import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared/services';
import { Injectable } from '@nestjs/common';
import { Prisma, ReminderChannel, ReminderSchedule, ReminderScheduleKind, ReminderScheduleStatus, TrainerMode } from '@prisma/client';
import { ESCALATION_CONFIG } from '../config/reminder.config';
import { VOCAB_TRAINER_ENTITY } from '../strategies/vocab-trainer-acted-check.strategy';
import { addUtcDays } from '../utils/reminder-date.util';
import { buildReminderDedupeKey } from '../utils/reminder-dedupe-key.util';
import { ReminderRetryDecision } from '../utils/reminder-retry.util';
import { EEmailTemplate, IN_FLIGHT_INITIAL_STATUSES } from '../utils/util.constant';

const ACTIVE_CANCEL_STATUSES: ReminderScheduleStatus[] = [ReminderScheduleStatus.PENDING, ReminderScheduleStatus.CLAIMED, ReminderScheduleStatus.QUEUED];

@Injectable()
export class ReminderScheduleRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findById(id: string): Promise<ReminderSchedule | null> {
        return this.prisma.reminderSchedule.findUnique({ where: { id } });
    }

    /**
     * Single-statement claim: the CTE locks eligible rows while the UPDATE runs,
     * preventing concurrent workers from selecting the same rows.
     * The UPDATE marks them CLAIMED in the same statement, so the follow-up read
     * can safely fetch the claimed rows by ID without an interactive transaction.
     */
    public async claimDueBatch(batchSize: number, instanceId: string): Promise<ReminderSchedule[]> {
        const now = new Date();
        const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
            WITH due AS (
                SELECT id FROM reminder_schedule
                WHERE status = 'PENDING'::"ReminderScheduleStatus"
                  AND due_at <= ${now}
                  AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
                ORDER BY due_at ASC, priority DESC
                LIMIT ${batchSize}
                FOR UPDATE SKIP LOCKED
            )
            UPDATE reminder_schedule s
            SET status = 'CLAIMED'::"ReminderScheduleStatus",
                locked_by = ${instanceId},
                locked_at = ${now},
                updated_at = ${now}
            FROM due
            WHERE s.id = due.id
            RETURNING s.id
        `;
        if (claimed.length === 0) {
            return [];
        }
        return this.prisma.reminderSchedule.findMany({ where: { id: { in: claimed.map((c) => c.id) } } });
    }

    public async transitionStatus(
        id: string,
        from: ReminderScheduleStatus,
        to: ReminderScheduleStatus,
        extra?: Partial<Prisma.ReminderScheduleUncheckedUpdateInput>,
    ): Promise<boolean> {
        const result = await this.prisma.reminderSchedule.updateMany({
            where: { id, status: from },
            data: {
                status: to,
                updatedAt: new Date(),
                ...extra,
            },
        });
        return result.count === 1;
    }

    public async cancelByEntity(entityType: string, entityId: string, reason: string, cancelledBy: string): Promise<number> {
        const now = new Date();
        const result = await this.prisma.reminderSchedule.updateMany({
            where: {
                entityType,
                entityId,
                status: { in: ACTIVE_CANCEL_STATUSES },
            },
            data: {
                status: ReminderScheduleStatus.CANCELLED,
                cancelledAt: now,
                cancelledBy,
                cancelReason: reason,
                completedAt: now,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.count;
    }

    /** Cancels the schedules of one template that have not been sent yet, except the one with `keepDedupeKey`. */
    public async cancelActiveExcept(entityType: string, entityId: string, template: string, keepDedupeKey: string | null, reason: string): Promise<number> {
        const now = new Date();
        const result = await this.prisma.reminderSchedule.updateMany({
            where: {
                entityType,
                entityId,
                template,
                status: { in: ACTIVE_CANCEL_STATUSES },
                ...(keepDedupeKey ? { dedupeKey: { not: keepDedupeKey } } : {}),
            },
            data: {
                status: ReminderScheduleStatus.CANCELLED,
                cancelledAt: now,
                cancelledBy: 'system',
                cancelReason: reason,
                completedAt: now,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.count;
    }

    /** The most recently sent schedules of one template for an entity, newest first. */
    public async findLatestSent(entityType: string, entityId: string, template: string, take: number): Promise<ReminderSchedule[]> {
        return this.prisma.reminderSchedule.findMany({
            where: { entityType, entityId, template, status: ReminderScheduleStatus.SENT },
            orderBy: { sentAt: 'desc' },
            take,
        });
    }

    /** True while a classic INITIAL reminder of the trainer is PENDING, CLAIMED, QUEUED or SENDING. Read-only. */
    public async hasInFlightInitial(trainerId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
        const count = await this.client(tx).reminderSchedule.count({
            where: {
                entityType: VOCAB_TRAINER_ENTITY,
                entityId: trainerId,
                template: EEmailTemplate.EXAM_REMINDER,
                reminderType: ReminderScheduleKind.INITIAL,
                status: { in: IN_FLIGHT_INITIAL_STATUSES },
            },
        });

        return count > 0;
    }

    /** What the send guard needs before an email goes out: the owner is active and the trainer (when there is one) still matches. */
    public async findSendGuardState(userId: string, trainerId: string | null): Promise<{ userActive: boolean; trainer: { mode: TrainerMode; reminderDisabled: boolean } | null }> {
        const [user, trainer] = await Promise.all([
            this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }),
            trainerId ? this.prisma.vocabTrainer.findFirst({ where: { id: trainerId, userId }, select: { mode: true, reminderDisabled: true } }) : null,
        ]);

        return { userActive: user?.isActive === true, trainer };
    }

    public async createSchedule(data: Prisma.ReminderScheduleUncheckedCreateInput): Promise<ReminderSchedule> {
        return this.prisma.reminderSchedule.create({ data });
    }

    public async findUserContact(userId: string): Promise<{ email: string; firstName: string; lastName: string } | null> {
        return this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, lastName: true } });
    }

    /** The trainer fields the bell needs. Scoped to the owner, like every other query. */
    public async findTrainerBrief(userId: string, trainerId: string): Promise<{ name: string; questionType: string } | null> {
        return this.prisma.vocabTrainer.findFirst({ where: { id: trainerId, userId }, select: { name: true, questionType: true } });
    }

    public async cancelSiblingEscalations(initialReminderId: string, excludeId: string): Promise<number> {
        const now = new Date();
        const result = await this.prisma.reminderSchedule.updateMany({
            where: {
                initialReminderId,
                id: { not: excludeId },
                reminderType: ReminderScheduleKind.ESCALATION,
                status: { in: ACTIVE_CANCEL_STATUSES },
            },
            data: {
                status: ReminderScheduleStatus.CANCELLED,
                cancelledAt: now,
                cancelledBy: 'system',
                cancelReason: 'sibling_user_acted',
                completedAt: now,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.count;
    }

    public async releaseStaleClaims(olderThan: Date): Promise<number> {
        const result = await this.prisma.reminderSchedule.updateMany({
            where: {
                status: ReminderScheduleStatus.CLAIMED,
                lockedAt: { lt: olderThan },
            },
            data: {
                status: ReminderScheduleStatus.PENDING,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.count;
    }

    public async createEscalationsForInitial(tx: Prisma.TransactionClient, initial: ReminderSchedule, sentAt: Date): Promise<void> {
        const template = initial.template;
        if (!ESCALATION_CONFIG.enabledTemplates.includes(template as (typeof ESCALATION_CONFIG.enabledTemplates)[number])) {
            return;
        }
        const override = ESCALATION_CONFIG.overrides[template as keyof typeof ESCALATION_CONFIG.overrides];
        const maxEscalations = override?.maxEscalations ?? ESCALATION_CONFIG.maxEscalations;
        const intervalDays = override?.escalationIntervalDays ?? ESCALATION_CONFIG.escalationIntervalDays;

        const rows: Prisma.ReminderScheduleCreateManyInput[] = [];
        for (let level = 1; level <= maxEscalations; level++) {
            const dueAt = addUtcDays(sentAt, level * intervalDays);
            rows.push({
                dedupeKey: buildReminderDedupeKey.vocabTrainerEscalation(initial.dedupeKey, level),
                channel: ReminderChannel.EMAIL,
                recipient: initial.recipient,
                template,
                payload: initial.payload as Prisma.InputJsonValue,
                dueAt,
                userId: initial.userId ?? undefined,
                entityType: initial.entityType,
                entityId: initial.entityId,
                reminderType: ReminderScheduleKind.ESCALATION,
                escalationLevel: level,
                escalationMax: maxEscalations,
                initialReminderId: initial.id,
                actedCheckAfter: sentAt,
                chainCount: initial.chainCount,
                chainMax: initial.chainMax,
                status: ReminderScheduleStatus.PENDING,
            });
        }

        await tx.reminderSchedule.createMany({ data: rows, skipDuplicates: true });
    }

    public async collapseOverdueEscalations(): Promise<number> {
        const result = await this.prisma.$executeRaw`
            UPDATE reminder_schedule
            SET status = 'EXPIRED'::"ReminderScheduleStatus",
                completed_at = now(),
                cancel_reason = 'collapsed_overdue'
            WHERE id IN (
              SELECT rs.id
              FROM reminder_schedule rs
              INNER JOIN (
                SELECT initial_reminder_id, MAX(escalation_level) AS max_level
                FROM reminder_schedule
                WHERE reminder_type = 'ESCALATION'::"ReminderScheduleKind"
                  AND status = 'PENDING'::"ReminderScheduleStatus"
                  AND due_at < now()
                GROUP BY initial_reminder_id
                HAVING COUNT(*) > 1
              ) keep
                ON rs.initial_reminder_id = keep.initial_reminder_id
              WHERE rs.reminder_type = 'ESCALATION'::"ReminderScheduleKind"
                AND rs.status = 'PENDING'::"ReminderScheduleStatus"
                AND rs.due_at < now()
                AND rs.escalation_level < keep.max_level
            )
        `;
        return typeof result === 'number' ? result : 0;
    }

    /** QUEUED rows not touched since `olderThan`, oldest first. Used to find rows whose Bull job never ran. */
    public async findQueuedOlderThan(olderThan: Date, take: number): Promise<Array<{ id: string; attempt: number }>> {
        return this.prisma.reminderSchedule.findMany({
            where: { status: ReminderScheduleStatus.QUEUED, updatedAt: { lt: olderThan } },
            orderBy: { updatedAt: 'asc' },
            take,
            select: { id: true, attempt: true },
        });
    }

    /**
     * FSRS rows stuck in SENDING since `olderThan`, oldest first. They are reported, never re-sent.
     * Pass `after`, the last row of the previous page, to read the next page. The position is (updatedAt, id).
     */
    public async findStalledFsrsSending(olderThan: Date, take: number, after?: { updatedAt: Date; id: string }): Promise<Array<{ id: string; template: string; updatedAt: Date }>> {
        return this.prisma.reminderSchedule.findMany({
            where: {
                status: ReminderScheduleStatus.SENDING,
                updatedAt: { lt: olderThan },
                template: EEmailTemplate.FSRS_DUE_REMINDER,
                ...(after && { OR: [{ updatedAt: { gt: after.updatedAt } }, { updatedAt: after.updatedAt, id: { gt: after.id } }] }),
            },
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take,
            select: { id: true, template: true, updatedAt: true },
        });
    }

    /** Classic rows stuck in SENDING since `olderThan`, oldest first. The reconciliation retries them when no job is left. */
    public async findStalledClassicSending(olderThan: Date, take: number): Promise<Array<{ id: string; attempt: number }>> {
        return this.prisma.reminderSchedule.findMany({
            where: { status: ReminderScheduleStatus.SENDING, updatedAt: { lt: olderThan }, template: { not: EEmailTemplate.FSRS_DUE_REMINDER } },
            orderBy: { updatedAt: 'asc' },
            take,
            select: { id: true, attempt: true },
        });
    }

    public async findInitialSentRemindersBefore(threshold: Date, take: number): Promise<ReminderSchedule[]> {
        return this.prisma.reminderSchedule.findMany({
            where: {
                reminderType: ReminderScheduleKind.INITIAL,
                status: ReminderScheduleStatus.SENT,
                sentAt: { lt: threshold },
                // Only these templates get escalations; the others would be picked again on every run and crowd out the real candidates.
                template: { in: [...ESCALATION_CONFIG.enabledTemplates] },
            },
            orderBy: { sentAt: 'asc' },
            take,
        });
    }

    public async countEscalationsForInitial(initialReminderId: string): Promise<number> {
        return this.prisma.reminderSchedule.count({
            where: {
                initialReminderId,
                reminderType: ReminderScheduleKind.ESCALATION,
            },
        });
    }

    public async markSentIfStillSending(tx: Prisma.TransactionClient, scheduleId: string, sentAt: Date): Promise<number> {
        const updated = await tx.reminderSchedule.updateMany({
            where: {
                id: scheduleId,
                status: ReminderScheduleStatus.SENDING,
            },
            data: {
                status: ReminderScheduleStatus.SENT,
                sentAt,
                completedAt: sentAt,
                attempt: { increment: 1 },
            },
        });
        return updated.count;
    }

    public async findByIdWithClient(tx: Prisma.TransactionClient, id: string): Promise<ReminderSchedule | null> {
        return tx.reminderSchedule.findUnique({ where: { id } });
    }

    /**
     * Writes the outcome of a failed attempt for a row that is still in `from`: back to PENDING with the
     * next attempt and time, or FAILED_TERMINAL. Returns false when the row has already moved on.
     */
    public async recordFailedAttempt(
        scheduleId: string,
        from: ReminderScheduleStatus,
        decision: ReminderRetryDecision,
        lastErrorCode: string,
        lastErrorMsg: string,
    ): Promise<boolean> {
        if (decision.terminal) {
            return this.transitionStatus(scheduleId, from, ReminderScheduleStatus.FAILED_TERMINAL, {
                attempt: decision.nextAttempt,
                lastErrorCode,
                lastErrorMsg,
                completedAt: new Date(),
            });
        }

        const result = await this.prisma.reminderSchedule.updateMany({
            where: { id: scheduleId, status: from },
            data: {
                status: ReminderScheduleStatus.PENDING,
                attempt: decision.nextAttempt,
                nextAttemptAt: decision.nextAttemptAt,
                lastErrorCode,
                lastErrorMsg,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.count === 1;
    }
}
