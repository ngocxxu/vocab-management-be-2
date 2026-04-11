import { Injectable } from '@nestjs/common';
import {
    Prisma,
    ReminderChannel,
    ReminderSchedule,
    ReminderScheduleKind,
    ReminderScheduleStatus,
} from '@prisma/client';
import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared/services';
import { ESCALATION_CONFIG } from '../config/reminder.config';
import { addUtcDays } from '../utils/reminder-date.util';
import { buildReminderDedupeKey } from '../utils/reminder-dedupe-key.util';

const ACTIVE_CANCEL_STATUSES: ReminderScheduleStatus[] = [
    ReminderScheduleStatus.PENDING,
    ReminderScheduleStatus.CLAIMED,
    ReminderScheduleStatus.QUEUED,
];

@Injectable()
export class ReminderScheduleRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findById(id: string): Promise<ReminderSchedule | null> {
        return this.prisma.reminderSchedule.findUnique({ where: { id } });
    }

    public async claimDueBatch(batchSize: number, instanceId: string): Promise<ReminderSchedule[]> {
        const now = new Date();
        return this.runInTransaction(async (tx) => {
            const picked = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM reminder_schedule
                WHERE status = 'PENDING'::"ReminderScheduleStatus"
                  AND due_at <= ${now}
                  AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
                ORDER BY due_at ASC, priority DESC
                LIMIT ${batchSize}
                FOR UPDATE SKIP LOCKED
            `;
            if (picked.length === 0) {
                return [];
            }
            const ids = picked.map((p) => p.id);
            await tx.reminderSchedule.updateMany({
                where: { id: { in: ids } },
                data: {
                    status: ReminderScheduleStatus.CLAIMED,
                    lockedBy: instanceId,
                    lockedAt: now,
                },
            });
            return tx.reminderSchedule.findMany({ where: { id: { in: ids } } });
        });
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

    public async cancelByEntity(
        entityType: string,
        entityId: string,
        reason: string,
        cancelledBy: string,
    ): Promise<number> {
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

    public async cancelSiblingEscalations(
        initialReminderId: string,
        excludeId: string,
    ): Promise<number> {
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

    public async createEscalationsForInitial(
        tx: Prisma.TransactionClient,
        initial: ReminderSchedule,
        sentAt: Date,
    ): Promise<void> {
        const template = initial.template;
        if (
            !ESCALATION_CONFIG.enabledTemplates.includes(
                template as (typeof ESCALATION_CONFIG.enabledTemplates)[number],
            )
        ) {
            return;
        }
        const override =
            ESCALATION_CONFIG.overrides[template as keyof typeof ESCALATION_CONFIG.overrides];
        const maxEscalations = override?.maxEscalations ?? ESCALATION_CONFIG.maxEscalations;
        const intervalDays =
            override?.escalationIntervalDays ?? ESCALATION_CONFIG.escalationIntervalDays;

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

    public async findQueuedScheduleIds(take: number): Promise<Array<{ id: string }>> {
        return this.prisma.reminderSchedule.findMany({
            where: { status: ReminderScheduleStatus.QUEUED },
            take,
            select: { id: true },
        });
    }

    public async findInitialSentRemindersBefore(
        threshold: Date,
        take: number,
    ): Promise<ReminderSchedule[]> {
        return this.prisma.reminderSchedule.findMany({
            where: {
                reminderType: ReminderScheduleKind.INITIAL,
                status: ReminderScheduleStatus.SENT,
                sentAt: { lt: threshold },
            },
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

    public async markSentIfStillSending(
        tx: Prisma.TransactionClient,
        scheduleId: string,
        sentAt: Date,
    ): Promise<number> {
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

    public findByIdWithClient(
        tx: Prisma.TransactionClient,
        id: string,
    ): Promise<ReminderSchedule | null> {
        return tx.reminderSchedule.findUnique({ where: { id } });
    }

    public async resetSendingToPendingRetry(
        scheduleId: string,
        nextAttempt: number,
        nextAttemptAt: Date,
        lastErrorCode: string,
        lastErrorMsg: string,
    ): Promise<number> {
        const result = await this.prisma.reminderSchedule.updateMany({
            where: { id: scheduleId, status: ReminderScheduleStatus.SENDING },
            data: {
                status: ReminderScheduleStatus.PENDING,
                attempt: nextAttempt,
                nextAttemptAt,
                lastErrorCode,
                lastErrorMsg,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.count;
    }
}
