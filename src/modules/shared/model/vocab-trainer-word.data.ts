import { ApiProperty } from '@nestjs/swagger';
import { VocabTrainer, VocabTrainerWord } from '@prisma/client';
import { VocabTrainerDto } from '.';
export class VocabTrainerWordDto {
    @ApiProperty({ description: 'Unique identifier for the trainer-word assignment' })
    public id: string;

    @ApiProperty({ description: 'ID of the vocabulary trainer' })
    public vocabTrainerId: string;

    @ApiProperty({ description: 'ID of the vocabulary' })
    public vocabId: string;

    @ApiProperty({ description: 'Date when the assignment was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the assignment was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'Vocabulary trainer details',
        required: false,
    })
    public readonly vocabTrainer?: VocabTrainerDto;

    public constructor(
        entity: VocabTrainerWord & {
            vocabTrainer?: VocabTrainer;
        },
    ) {
        this.id = entity.id;
        this.vocabTrainerId = entity.vocabTrainerId;
        this.vocabId = entity.vocabId;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.vocabTrainer = entity.vocabTrainer
            ? new VocabTrainerDto(entity.vocabTrainer)
            : undefined;
    }
}
