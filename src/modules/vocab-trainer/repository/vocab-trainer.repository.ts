import { Injectable } from '@nestjs/common';
import { Prisma, VocabTrainer } from '@prisma/client';
import { PrismaService } from '../../common';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { VocabTrainerQueryParamsInput } from '../model/vocab-trainer-query-params.input';

@Injectable()
export class VocabTrainerRepository {
    public constructor(private readonly prismaService: PrismaService) {}

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
            this.prismaService.vocabTrainer.count({ where }),
            this.prismaService.vocabTrainer.findMany({
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

        return this.prismaService.vocabTrainer.findFirst({
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

        return this.prismaService.vocabTrainer.findFirst({
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

        return this.prismaService.vocabTrainer.findFirst({
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
        return this.prismaService.vocabTrainer.create({
            data,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async update(id: string, data: Prisma.VocabTrainerUpdateInput): Promise<VocabTrainer> {
        return this.prismaService.vocabTrainer.update({
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

        return this.prismaService.vocabTrainer.delete({
            where,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }

    public async deleteResultsByTrainerId(trainerId: string): Promise<void> {
        await this.prismaService.vocabTrainerResult.deleteMany({
            where: { vocabTrainerId: trainerId },
        });
    }

    public async createResults(
        data: Prisma.VocabTrainerResultCreateManyInput[],
    ): Promise<void> {
        await this.prismaService.vocabTrainerResult.createMany({ data });
    }

    public async findByIds(ids: string[], userId?: string): Promise<VocabTrainer[]> {
        const where: Prisma.VocabTrainerWhereInput = {
            id: { in: ids },
        };
        if (userId) {
            where.userId = userId;
        }

        return this.prismaService.vocabTrainer.findMany({
            where,
            include: {
                vocabAssignments: true,
                results: true,
            },
        });
    }
}

