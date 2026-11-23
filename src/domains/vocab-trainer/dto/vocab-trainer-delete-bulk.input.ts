import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export const MAX_BULK_DELETE_IDS = 100;

export class VocabTrainerDeleteBulkInput {
    @ApiProperty({
        description: 'Trainer IDs to delete',
        type: [String],
        example: ['clxxx1', 'clxxx2'],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(MAX_BULK_DELETE_IDS)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    public readonly ids: string[];
}
