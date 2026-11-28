import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { buildPrismaWhere } from '@/shared/utils/query-builder.util';
import { Injectable } from '@nestjs/common';
import { Prisma, QuestionType, TrainerMode, VocabTrainer, VocabTrainerAttempt, VocabTrainerResult } from '@prisma/client';
import { VocabTrainerQueryParamsInput } from '../dto/vocab-trainer-query-params.input';
import { AttemptKind, AttemptUndo, GRADING_STATUS, REGRADE_LIMIT } from '../utils/attempt-snapshot.util';

/** The submit fields the trainer DTO shows. The answers snapshot is left out: list and detail reads do not need it. */
const ATTEMPT_SUMMARY = { select: { submittedAt: true, gradingStatus: true, regradeCount: true } } as const;

@Injectable()
export class VocabTrainerRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findWithPagination(
        query: VocabTrainerQueryParamsInput,
        userId: string | undefined,
        skip: number,
        take: number,
        orderBy: Prisma.VocabTrainerOrderByWithRelationInput,
    ): Promise<{ totalItems: number; trainers: VocabTrainer[] }> {
        const where = buildPrismaWhere<VocabTrainerQueryParamsInput, Prisma.VocabTrainerWhereInput>(query, {
            stringFields: ['name', 'userId'],
            enumFields: ['questionType'],
            customMap: (input, w) => {
                if (userId) {
                    (w as Prisma.VocabTrainerWhereInput).userId = userId;
                }
                if (input.status && Array.isArray(input.status) && input.status.length > 0) {
                    (w as Prisma.VocabTrainerWhereInput).status = {
                        in: input.status,
                    };
                }
            },
        });

        const [totalItems, trainers] = await Promise.all([
            this.prisma.vocabTrainer.count({ where }),
            this.prisma.vocabTrainer.findMany({
                where,
                include: {
                    vocabAssignments: true,
                    results: true,
                    attempt: ATTEMPT_SUMMARY,
                },
                orderBy,
                skip,
                take,
            }),
        ]);

        return { totalItems, trainers };
    }

    public async findById(id: string, userId?: string): Promise<VocabTrainer | null> {
        const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
            id,
        };
        if (userId) {
            where.userId = userId;
        }

        return this.prisma.vocabTrainer.findFirst({
            where,
            include: {
                vocabAssignments: true,
                results: true,
                attempt: ATTEMPT_SUMMARY,
            },
        });
    }

    public async findByIdWithVocabs(id: string, userId?: string): Promise<VocabTrainer | null> {
        const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
            id,
        };
        if (userId) {
            where.userId = userId;
        }

        return this.prisma.vocabTrainer.findFirst({
            where,
            include: {
                vocabAssignments: {
                    include: {
                        vocab: {
                            include: {
                                textTargets: true,
                            },
                        },
                    },
                },
                results: true,
                attempt: ATTEMPT_SUMMARY,
            },
        });
    }

    public async findByIdWithVocabsAndResults(id: string, userId?: string): Promise<VocabTrainer | null> {
        const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
            id,
        };
        if (userId) {
            where.userId = userId;
        }

        return this.prisma.vocabTrainer.findFirst({
            where,
            include: {
                vocabAssignments: {
                    include: {
                        vocab: {
                            include: {
                                textTargets: true,
                            },
                        },
                    },
                },
                results: true,
                attempt: ATTEMPT_SUMMARY,
            },
        });
    }

    public async create(data: Prisma.VocabTrainerCreateInput, tx?: Prisma.TransactionClient): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.create({
            data,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async update(id: string, data: Prisma.VocabTrainerUpdateInput): Promise<VocabTrainer> {
        return this.prisma.vocabTrainer.update({
            where: { id },
            data,
            include: {
                vocabAssignments: true,
                results: true,
                attempt: ATTEMPT_SUMMARY,
            },
        });
    }

    public async delete(id: string, userId?: string): Promise<VocabTrainer> {
        const where: Prisma.VocabTrainerWhereUniqueInput & Prisma.VocabTrainerWhereInput = {
            id,
        };
        if (userId) {
            where.userId = userId;
        }

        return this.prisma.vocabTrainer.delete({
            where,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async deleteVocabTrainerResults(trainerId: string, tx?: Prisma.TransactionClient): Promise<Prisma.BatchPayload> {
        return this.client(tx).vocabTrainerResult.deleteMany({
            where: { vocabTrainerId: trainerId },
        });
    }

    public async deleteResultsByTrainerId(trainerId: string): Promise<void> {
        await this.deleteVocabTrainerResults(trainerId);
    }

    public async createVocabTrainerResultsMany(data: Prisma.VocabTrainerResultCreateManyInput[], tx?: Prisma.TransactionClient): Promise<{ count: number }> {
        return this.client(tx).vocabTrainerResult.createMany({ data });
    }

    public async createResults(data: Prisma.VocabTrainerResultCreateManyInput[]): Promise<void> {
        await this.createVocabTrainerResultsMany(data);
    }

    public async createVocabTrainerResult(data: Prisma.VocabTrainerResultUncheckedCreateInput, tx?: Prisma.TransactionClient): Promise<void> {
        await this.client(tx).vocabTrainerResult.create({ data });
    }

    /**
     * Locks the trainer row until the transaction ends (SELECT ... FOR UPDATE), then reads it. Counting an attempt and
     * toggling reminders both take this lock, so they never interleave for one trainer. Null when the trainer is gone.
     */
    public async lockAndFindForUpdate(tx: Prisma.TransactionClient, id: string): Promise<VocabTrainer | null> {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM vocab_trainer WHERE id = ${id} FOR UPDATE`;
        if (locked.length === 0) {
            return null;
        }

        return tx.vocabTrainer.findUnique({ where: { id } });
    }

    /** The result rows of the latest applied attempt. Used to answer a retried AI job without writing again. */
    public async findResultsByTrainerId(trainerId: string): Promise<VocabTrainerResult[]> {
        return this.prisma.vocabTrainerResult.findMany({ where: { vocabTrainerId: trainerId }, orderBy: { createdAt: 'asc' } });
    }

    public async findVocabTrainerByIdMinimal(id: string, tx?: Prisma.TransactionClient): Promise<VocabTrainer | null> {
        return this.client(tx).vocabTrainer.findUnique({ where: { id } });
    }

    /** The trainer only when this user owns it. Null for a missing trainer or another user's trainer. */
    public async findVocabTrainerByIdForUserMinimal(id: string, userId: string, tx?: Prisma.TransactionClient): Promise<VocabTrainer | null> {
        return this.client(tx).vocabTrainer.findFirst({ where: { id, userId } });
    }

    public async findLastExamSubmittedAt(id: string): Promise<{ lastExamSubmittedAt: Date | null; mode: TrainerMode } | null> {
        return this.prisma.vocabTrainer.findUnique({
            where: { id },
            select: { lastExamSubmittedAt: true, mode: true },
        });
    }

    public async deleteVocabTrainerRow(id: string, tx?: Prisma.TransactionClient): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.delete({
            where: { id },
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async updateVocabTrainerWithIncludes(id: string, data: Prisma.VocabTrainerUpdateInput, tx?: Prisma.TransactionClient): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.update({
            where: { id },
            data,
            include: {
                vocabAssignments: true,
                results: true,
                attempt: ATTEMPT_SUMMARY,
            },
        });
    }

    public async updateVocabTrainerFields(id: string, data: Prisma.VocabTrainerUpdateInput, tx?: Prisma.TransactionClient): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.update({
            where: { id },
            data,
        });
    }

    /** Removes one word from the trainer. Its FSRS cards go with it (composite foreign key); review logs stay. Returns the rows deleted. */
    public async deleteTrainerWord(tx: Prisma.TransactionClient, trainerId: string, vocabId: string): Promise<number> {
        const result = await tx.vocabTrainerWord.deleteMany({ where: { vocabTrainerId: trainerId, vocabId } });

        return result.count;
    }

    public async replaceVocabTrainerWordAssignments(
        tx: Prisma.TransactionClient,
        id: string,
        trainerData: {
            name?: string;
            questionType?: QuestionType;
            reminderTime?: number;
            countTime?: number;
            setCountTime?: number;
            reminderSpacingDays?: number;
            reminderMaxRepeat?: number;
            fsrsDesiredRetention?: number;
            fsrsMaximumInterval?: number;
            fsrsNewPerDay?: number | null;
            fsrsEndsAt?: Date | null;
        },
        existing: VocabTrainer,
        uniqueVocabIds: string[],
    ): Promise<VocabTrainer | null> {
        await tx.vocabTrainer.update({
            where: { id },
            data: {
                name: trainerData.name,
                questionType: trainerData.questionType ?? existing.questionType,
                reminderTime: trainerData.reminderTime ?? existing.reminderTime,
                countTime: trainerData.countTime ?? existing.countTime,
                setCountTime: trainerData.setCountTime ?? existing.setCountTime,
                reminderSpacingDays: trainerData.reminderSpacingDays ?? existing.reminderSpacingDays,
                reminderMaxRepeat: trainerData.reminderMaxRepeat ?? existing.reminderMaxRepeat,
                fsrsDesiredRetention: trainerData.fsrsDesiredRetention,
                fsrsMaximumInterval: trainerData.fsrsMaximumInterval,
                fsrsNewPerDay: trainerData.fsrsNewPerDay,
                fsrsEndsAt: trainerData.fsrsEndsAt,
            },
            include: {
                vocabAssignments: true,
                results: true,
            },
        });

        // Only the words that left the trainer are deleted: deleting a word also deletes its FSRS cards (composite
        // foreign key), so a delete-all-and-recreate would wipe the progress of the words that stay.
        await tx.vocabTrainerWord.deleteMany({
            where: { vocabTrainerId: id, vocabId: { notIn: uniqueVocabIds } },
        });

        if (uniqueVocabIds.length > 0) {
            await tx.vocabTrainerWord.createMany({
                data: uniqueVocabIds.map((vocabId) => ({
                    vocabTrainerId: id,
                    vocabId,
                })),
                skipDuplicates: true,
            });
        }

        return tx.vocabTrainer.findUnique({
            where: { id },
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    /** The latest AI-graded submit (fill-in-blank or audio) of the trainer, or null when there is none. */
    public async findAttemptByTrainerId(trainerId: string, userId: string, tx?: Prisma.TransactionClient): Promise<VocabTrainerAttempt | null> {
        return this.client(tx).vocabTrainerAttempt.findFirst({ where: { trainerId, userId } });
    }

    /**
     * Writes a new AI-graded submit in place of the trainer's previous one, as `grading` with no regrade used. It runs under the
     * user's job lock, before the job is queued (#17). The returned undo puts the previous submit back, or removes the row.
     */
    public async recordAttemptSubmit(data: {
        trainerId: string;
        userId: string;
        kind: AttemptKind;
        submittedAt: Date;
        countsAsAttempt: boolean;
        answersSnapshot: Prisma.InputJsonValue;
    }): Promise<AttemptUndo> {
        const previous = await this.findAttemptByTrainerId(data.trainerId, data.userId);
        const record = { ...data, gradingStatus: GRADING_STATUS.GRADING, regradeCount: 0 };
        await this.prisma.vocabTrainerAttempt.upsert({ where: { trainerId: data.trainerId }, create: record, update: record });

        return async () => {
            if (previous) {
                const restored = { ...previous, answersSnapshot: previous.answersSnapshot as Prisma.InputJsonValue };
                await this.prisma.vocabTrainerAttempt.upsert({ where: { trainerId: previous.trainerId }, create: restored, update: restored });
                return;
            }
            await this.prisma.vocabTrainerAttempt.deleteMany({ where: { trainerId: data.trainerId } });
        };
    }

    /** Marks the submit as graded, in the transaction that writes its results. Only the submit the job belongs to (same submit time). */
    public async markAttemptGraded(trainerId: string, userId: string, submittedAt: Date, tx?: Prisma.TransactionClient): Promise<number> {
        const result = await this.client(tx).vocabTrainerAttempt.updateMany({ where: { trainerId, userId, submittedAt }, data: { gradingStatus: GRADING_STATUS.GRADED } });

        return result.count;
    }

    /**
     * Marks a grading that is still running as failed, so the client can regrade it. Only the submit the job belongs to, and only
     * while it is `grading`: a graded submit is never changed back.
     */
    public async markAttemptGradingFailed(trainerId: string, userId: string, submittedAt: Date): Promise<number> {
        const result = await this.prisma.vocabTrainerAttempt.updateMany({
            where: { trainerId, userId, submittedAt, gradingStatus: GRADING_STATUS.GRADING },
            data: { gradingStatus: GRADING_STATUS.GRADING_FAILED },
        });

        return result.count;
    }

    /**
     * Regrade, first step, under the user's job lock: `grading_failed` becomes `grading` and one regrade is used, in one
     * conditional update. Null when the submit cannot be regraded now. `rollback` gives both back when the job could not be queued.
     */
    public async claimAttemptRegrade(trainerId: string, userId: string): Promise<{ attempt: VocabTrainerAttempt; rollback: () => Promise<void> } | null> {
        const attempt = await this.findAttemptByTrainerId(trainerId, userId);
        if (!attempt) {
            return null;
        }

        const claimed = await this.prisma.vocabTrainerAttempt.updateMany({
            where: { trainerId, userId, submittedAt: attempt.submittedAt, gradingStatus: GRADING_STATUS.GRADING_FAILED, regradeCount: { lt: REGRADE_LIMIT } },
            data: { gradingStatus: GRADING_STATUS.GRADING, regradeCount: { increment: 1 } },
        });
        if (claimed.count === 0) {
            return null;
        }

        return {
            attempt,
            rollback: async () => {
                await this.prisma.vocabTrainerAttempt.updateMany({
                    where: { trainerId, userId, submittedAt: attempt.submittedAt, gradingStatus: GRADING_STATUS.GRADING },
                    data: { gradingStatus: GRADING_STATUS.GRADING_FAILED, regradeCount: { decrement: 1 } },
                });
            },
        };
    }

    public async findByIds(ids: string[], userId?: string): Promise<VocabTrainer[]> {
        const where: Prisma.VocabTrainerWhereInput = {
            id: { in: ids },
        };
        if (userId) {
            where.userId = userId;
        }

        return this.prisma.vocabTrainer.findMany({
            where,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }
}
