import { Injectable, NotFoundException } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { VocabTrainerDto, VocabTrainerInput } from '../model';
import { UpdateVocabTrainerInput } from '../model/update-vocab-trainer.input';

@Injectable()
export class VocabTrainerService {
    private readonly errorMapping = {
        P2002: 'VocabTrainer with this name already exists',
        P2025: {
            update: 'VocabTrainer not found',
            delete: 'VocabTrainer not found',
            findOne: 'VocabTrainer not found',
            create: 'Related record not found',
            find: 'VocabTrainer not found',
        },
    };

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all vocab trainers in the database
     */
    public async find(): Promise<VocabTrainerDto[]> {
        try {
            const trainers = await this.prismaService.vocabTrainer.findMany({
                include: {
                    vocabAssignments: true,
                    results: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            return trainers.map((trainer) => new VocabTrainerDto(trainer));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.errorMapping);
        }
    }

    /**
     * Find a single vocab trainer by ID
     */
    public async findOne(id: string): Promise<VocabTrainerDto> {
        try {
            const trainer = await this.prismaService.vocabTrainer.findUnique({
                where: { id },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });
            if (!trainer) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) throw error;
            PrismaErrorHandler.handle(error, 'findOne', this.errorMapping);
            throw error;
        }
    }

    /**
     * Create a new vocab trainer
     */
    public async create(input: VocabTrainerInput): Promise<VocabTrainerDto> {
        try {
            const { vocabAssignmentIds = [], ...trainerData } = input;
            const trainer = await this.prismaService.vocabTrainer.create({
                data: {
                    name: trainerData.name,
                    status: trainerData.status ?? TrainerStatus.PENDING,
                    duration: trainerData.duration ?? 0,
                    countTime: trainerData.countTime ?? 0,
                    setCountTime: trainerData.setCountTime ?? 0,
                    reminderDisabled: trainerData.reminderDisabled ?? false,
                    reminderRepeat: trainerData.reminderRepeat ?? 2,
                    reminderLastRemind: trainerData.reminderLastRemind ?? new Date(),
                },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });

            // Create vocab assignments if any
            if (vocabAssignmentIds.length > 0) {
                await Promise.all(
                    vocabAssignmentIds.map(async (vocabId) =>
                        this.prismaService.vocabTrainerWord.create({
                            data: {
                                vocabTrainerId: trainer.id,
                                vocabId,
                            },
                        })
                    )
                );
            }

            // Fetch the trainer again to include the new assignments
            const trainerWithAssignments = await this.prismaService.vocabTrainer.findUnique({
                where: { id: trainer.id },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });

            if (!trainerWithAssignments) {
                throw new NotFoundException(`VocabTrainer with ID ${trainer.id} not found after creation`);
            }

            return new VocabTrainerDto(trainerWithAssignments);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.errorMapping);
        }
    }

    /**
     * Update a vocab trainer
     */
    public async update(id: string, input: UpdateVocabTrainerInput): Promise<VocabTrainerDto> {
        try {
            const existing = await this.prismaService.vocabTrainer.findUnique({ where: { id } });
            if (!existing) {
                throw new NotFoundException(`VocabTrainer with ID ${id} not found`);
            }
            const trainer = await this.prismaService.vocabTrainer.update({
                where: { id },
                data: {
                    name: input.name,
                    status: input.status,
                    duration: input.duration ?? existing.duration,
                    countTime: input.countTime ?? existing.countTime,
                    setCountTime: input.setCountTime ?? existing.setCountTime,
                    reminderDisabled: input.reminderDisabled ?? existing.reminderDisabled,
                    reminderRepeat: input.reminderRepeat ?? existing.reminderRepeat,
                    reminderLastRemind: input.reminderLastRemind ?? existing.reminderLastRemind,
                },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) throw error;
            PrismaErrorHandler.handle(error, 'update', this.errorMapping);
        }
    }

    /**
     * Delete a vocab trainer
     */
    public async delete(id: string): Promise<VocabTrainerDto> {
        try {
            const trainer = await this.prismaService.vocabTrainer.delete({
                where: { id },
                include: {
                    vocabAssignments: true,
                    results: true,
                },
            });
            return new VocabTrainerDto(trainer);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'delete', this.errorMapping);
        }
    }
}