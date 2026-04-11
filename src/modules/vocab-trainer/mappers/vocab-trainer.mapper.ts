import { Prisma, QuestionType, TrainerStatus, VocabTrainer } from '@prisma/client';
import { PaginationDto } from '../../shared/models';
import { UpdateVocabTrainerInput, VocabTrainerDto, VocabTrainerInput } from '../models';

export type VocabTrainerScalarPatch = {
    name?: string;
    status?: TrainerStatus;
    questionType?: QuestionType;
    reminderTime?: number;
    countTime?: number;
    setCountTime?: number;
    reminderDisabled?: boolean;
    reminderRepeat?: number;
    reminderLastRemind?: Date;
};

type VocabTrainerEntity = ConstructorParameters<typeof VocabTrainerDto>[0];

export class VocabTrainerMapper {
    public toCreateInput(input: VocabTrainerInput, userId: string): Prisma.VocabTrainerCreateInput {
        const { vocabAssignmentIds = [], ...trainerData } = input;
        return {
            name: trainerData.name,
            status: trainerData.status ?? TrainerStatus.PENDING,
            questionType: trainerData.questionType ?? QuestionType.MULTIPLE_CHOICE,
            reminderTime: trainerData.reminderTime ?? 0,
            countTime: trainerData.countTime ?? 0,
            setCountTime: trainerData.setCountTime ?? 0,
            reminderDisabled: trainerData.reminderDisabled ?? false,
            reminderRepeat: trainerData.reminderRepeat ?? 0,
            reminderLastRemind: trainerData.reminderLastRemind ?? new Date(),
            user: { connect: { id: userId } },
            vocabAssignments:
                vocabAssignmentIds.length > 0
                    ? {
                          create: vocabAssignmentIds.map((vocabId) => ({
                              vocab: { connect: { id: vocabId } },
                          })),
                      }
                    : undefined,
        };
    }

    public toScalarPatch(
        trainerData: Omit<UpdateVocabTrainerInput, 'vocabAssignmentIds'>,
        existing: VocabTrainer,
    ): VocabTrainerScalarPatch {
        return {
            name: trainerData.name,
            status: trainerData.status,
            questionType: trainerData.questionType ?? existing.questionType,
            reminderTime: trainerData.reminderTime ?? existing.reminderTime,
            countTime: trainerData.countTime ?? existing.countTime,
            setCountTime: trainerData.setCountTime ?? existing.setCountTime,
            reminderDisabled: trainerData.reminderDisabled ?? existing.reminderDisabled,
            reminderRepeat: trainerData.reminderRepeat ?? existing.reminderRepeat,
            reminderLastRemind: trainerData.reminderLastRemind ?? existing.reminderLastRemind,
        };
    }

    public buildUpdateInput(
        trainerData: Omit<UpdateVocabTrainerInput, 'vocabAssignmentIds'>,
        existing: VocabTrainer,
    ): Prisma.VocabTrainerUpdateInput {
        const p = this.toScalarPatch(trainerData, existing);
        return {
            name: p.name,
            status: p.status,
            questionType: p.questionType,
            reminderTime: p.reminderTime,
            countTime: p.countTime,
            setCountTime: p.setCountTime,
            reminderDisabled: p.reminderDisabled,
            reminderRepeat: p.reminderRepeat,
            reminderLastRemind: p.reminderLastRemind,
        };
    }

    public toResponse(trainer: VocabTrainerEntity): VocabTrainerDto {
        return new VocabTrainerDto(trainer);
    }

    public toResponseList(trainers: VocabTrainerEntity[]): VocabTrainerDto[] {
        return trainers.map((t) => this.toResponse(t));
    }

    public toPaginated(
        items: VocabTrainerDto[],
        totalItems: number,
        page: number,
        pageSize: number,
    ): PaginationDto<VocabTrainerDto> {
        return new PaginationDto<VocabTrainerDto>(items, totalItems, page, pageSize);
    }
}
