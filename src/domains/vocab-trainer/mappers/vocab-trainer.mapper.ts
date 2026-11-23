import { PaginationDto } from '@/shared/dto';
import { Prisma, QuestionType, TrainerMode, TrainerStatus, VocabTrainer } from '@prisma/client';
import { UpdateVocabTrainerInput, VocabTrainerDto, VocabTrainerInput } from '../dto';

/** The fields an update may change. Status, Passes and the last-remind time are not here: only an exam changes them (#42). */
export type VocabTrainerScalarPatch = {
    name?: string;
    questionType?: QuestionType;
    reminderTime?: number;
    countTime?: number;
    setCountTime?: number;
    reminderSpacingDays?: number;
    reminderMaxRepeat?: number;
    // FSRS settings that can change after creation (undefined = keep, null = clear). Mode and directions are fixed at creation.
    fsrsDesiredRetention?: number;
    fsrsMaximumInterval?: number;
    fsrsNewPerDay?: number | null;
    fsrsEndsAt?: Date | null;
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
            ...(trainerData.reminderSpacingDays !== undefined ? { reminderSpacingDays: trainerData.reminderSpacingDays } : {}),
            ...(trainerData.reminderMaxRepeat !== undefined ? { reminderMaxRepeat: trainerData.reminderMaxRepeat } : {}),
            mode: trainerData.mode ?? TrainerMode.CLASSIC,
            fsrsDesiredRetention: trainerData.fsrsDesiredRetention,
            fsrsMaximumInterval: trainerData.fsrsMaximumInterval,
            fsrsNewPerDay: trainerData.fsrsNewPerDay,
            fsrsDirections: trainerData.fsrsDirections,
            fsrsEndsAt: trainerData.fsrsEndsAt,
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

    public toScalarPatch(trainerData: Omit<UpdateVocabTrainerInput, 'vocabAssignmentIds'>, existing: VocabTrainer): VocabTrainerScalarPatch {
        return {
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
        };
    }

    public buildUpdateInput(trainerData: Omit<UpdateVocabTrainerInput, 'vocabAssignmentIds'>, existing: VocabTrainer): Prisma.VocabTrainerUpdateInput {
        const p = this.toScalarPatch(trainerData, existing);
        return {
            name: p.name,
            questionType: p.questionType,
            reminderTime: p.reminderTime,
            countTime: p.countTime,
            setCountTime: p.setCountTime,
            reminderSpacingDays: p.reminderSpacingDays,
            reminderMaxRepeat: p.reminderMaxRepeat,
            fsrsDesiredRetention: p.fsrsDesiredRetention,
            fsrsMaximumInterval: p.fsrsMaximumInterval,
            fsrsNewPerDay: p.fsrsNewPerDay,
            fsrsEndsAt: p.fsrsEndsAt,
        };
    }

    public toResponse(trainer: VocabTrainerEntity): VocabTrainerDto {
        return new VocabTrainerDto(trainer);
    }

    public toResponseList(trainers: VocabTrainerEntity[]): VocabTrainerDto[] {
        return trainers.map((t) => this.toResponse(t));
    }

    public toPaginated(items: VocabTrainerDto[], totalItems: number, page: number, pageSize: number): PaginationDto<VocabTrainerDto> {
        return new PaginationDto<VocabTrainerDto>(items, totalItems, page, pageSize);
    }
}
