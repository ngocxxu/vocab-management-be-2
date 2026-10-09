import { ApiProperty } from '@nestjs/swagger';
import { TrainerMode } from '@prisma/client';

export class VocabTrainerConflictTrainerDto {
    @ApiProperty({ description: 'Trainer ID', example: 'cmcvuc64d00002dtxq5tkcl27' })
    public id!: string;

    @ApiProperty({ description: 'Trainer name', example: 'Exam words' })
    public name!: string;

    @ApiProperty({ description: 'Trainer mode', enum: TrainerMode })
    public mode!: TrainerMode;
}

/** A word of the user and the trainers that still hold it. `trainers` is empty when the word is free. */
export class VocabTrainerConflictDto {
    @ApiProperty({ description: 'Vocab ID', example: 'cmcvuc64d00012dtxq5tkcl28' })
    public vocabId!: string;

    @ApiProperty({ description: 'Source text of the word', example: 'apple' })
    public textSource!: string;

    @ApiProperty({ description: 'Trainers that still hold the word', type: () => [VocabTrainerConflictTrainerDto] })
    public trainers!: VocabTrainerConflictTrainerDto[];
}
