import { Injectable } from '@nestjs/common';
import { Prisma, QuestionType, TrainerStatus, VocabTrainer } from '@prisma/client';
import { BaseRepository } from '../../../database';
import { PrismaService } from '../../shared';
import { buildPrismaWhere } from '../../shared/utils/query-builder.util';
import { VocabTrainerQueryParamsInput } from '../models/vocab-trainer-query-params.input';

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
        const where = buildPrismaWhere<
            VocabTrainerQueryParamsInput,
            Prisma.VocabTrainerWhereInput
        >(query, {
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
                },
                orderBy,
                skip,
                take,
            }),
        ]);

        return { totalItems, trainers };
    }

    public async findById(
        id: string,
        userId?: string,
    ): Promise<VocabTrainer | null> {
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
            },
        });
    }

    public async findByIdWithVocabs(
        id: string,
        userId?: string,
    ): Promise<VocabTrainer | null> {
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
            },
        });
    }

    public async findByIdWithVocabsAndResults(
        id: string,
        userId?: string,
    ): Promise<VocabTrainer | null> {
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
            },
        });
    }

    public async create(data: Prisma.VocabTrainerCreateInput): Promise<VocabTrainer> {
        return this.prisma.vocabTrainer.create({
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

    public async deleteVocabTrainerResults(
        trainerId: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Prisma.BatchPayload> {
        return this.client(tx).vocabTrainerResult.deleteMany({
            where: { vocabTrainerId: trainerId },
        });
    }

    public async deleteResultsByTrainerId(trainerId: string): Promise<void> {
        await this.deleteVocabTrainerResults(trainerId);
    }

    public async createVocabTrainerResultsMany(
        data: Prisma.VocabTrainerResultCreateManyInput[],
        tx?: Prisma.TransactionClient,
    ): Promise<{ count: number }> {
        return this.client(tx).vocabTrainerResult.createMany({ data });
    }

    public async createResults(
        data: Prisma.VocabTrainerResultCreateManyInput[],
    ): Promise<void> {
        await this.createVocabTrainerResultsMany(data);
    }

    public async createVocabTrainerResult(
        data: Prisma.VocabTrainerResultUncheckedCreateInput,
        tx?: Prisma.TransactionClient,
    ): Promise<void> {
        await this.client(tx).vocabTrainerResult.create({ data });
    }

    public async findVocabTrainerByIdMinimal(
        id: string,
        tx?: Prisma.TransactionClient,
    ): Promise<VocabTrainer | null> {
        return this.client(tx).vocabTrainer.findUnique({ where: { id } });
    }

    public async findLastExamSubmittedAt(
        id: string,
    ): Promise<{ lastExamSubmittedAt: Date | null } | null> {
        return this.prisma.vocabTrainer.findUnique({
            where: { id },
            select: { lastExamSubmittedAt: true },
        });
    }

    public async deleteVocabTrainerRow(
        id: string,
        tx?: Prisma.TransactionClient,
    ): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.delete({
            where: { id },
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async updateVocabTrainerWithIncludes(
        id: string,
        data: Prisma.VocabTrainerUpdateInput,
        tx?: Prisma.TransactionClient,
    ): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.update({
            where: { id },
            data,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async updateVocabTrainerFields(
        id: string,
        data: Prisma.VocabTrainerUpdateInput,
        tx?: Prisma.TransactionClient,
    ): Promise<VocabTrainer> {
        return this.client(tx).vocabTrainer.update({
            where: { id },
            data,
        });
    }

    public async replaceVocabTrainerWordAssignments(
        tx: Prisma.TransactionClient,
        id: string,
        trainerData: {
            name?: string;
            status?: TrainerStatus;
            questionType?: QuestionType;
            reminderTime?: number;
            countTime?: number;
            setCountTime?: number;
            reminderDisabled?: boolean;
            reminderRepeat?: number;
            reminderLastRemind?: Date;
        },
        existing: VocabTrainer,
        uniqueVocabIds: string[],
    ): Promise<VocabTrainer | null> {
        await tx.vocabTrainer.update({
            where: { id },
            data: {
                name: trainerData.name,
                status: trainerData.status,
                questionType: trainerData.questionType ?? existing.questionType,
                reminderTime: trainerData.reminderTime ?? existing.reminderTime,
                countTime: trainerData.countTime ?? existing.countTime,
                setCountTime: trainerData.setCountTime ?? existing.setCountTime,
                reminderDisabled: trainerData.reminderDisabled ?? existing.reminderDisabled,
                reminderRepeat: trainerData.reminderRepeat ?? existing.reminderRepeat,
                reminderLastRemind: trainerData.reminderLastRemind ?? existing.reminderLastRemind,
            },
            include: {
                vocabAssignments: true,
                results: true,
            },
        });

        await tx.vocabTrainerWord.deleteMany({
            where: { vocabTrainerId: id },
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

