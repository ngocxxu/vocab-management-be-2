import { ApiProperty } from '@nestjs/swagger';
import { TrainerStatus, VocabTrainerResult } from '@prisma/client';

export class VocabTrainerResultDto {
    @ApiProperty({ description: 'Unique identifier for the result' })
    public id: string;

    @ApiProperty({ description: 'ID of the vocab trainer' })
    public vocabTrainerId: string;

    @ApiProperty({ description: 'Status of the result' })
    public status: TrainerStatus;

    @ApiProperty({ description: 'User selected value' })
    public userSelected: string;

    @ApiProperty({ description: 'System selected value' })
    public systemSelected: string;

    @ApiProperty({ description: 'Created at' })
    public createdAt: Date;

    @ApiProperty({ description: 'Updated at' })
    public updatedAt: Date;

    @ApiProperty({ description: 'AI explanation for the answer', required: false })
    public data?: { explanation?: string };

    public constructor(entity: VocabTrainerResult) {
        this.id = entity.id;
        this.vocabTrainerId = entity.vocabTrainerId;
        this.status = entity.status;
        this.userSelected = entity.userSelected;
        this.systemSelected = entity.systemSelected;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.data = entity.data as { explanation?: string };
    }
}
