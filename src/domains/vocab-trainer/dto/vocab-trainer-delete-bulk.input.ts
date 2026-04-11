import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class VocabTrainerDeleteBulkInput {
    @ApiProperty({
        description: 'Trainer IDs to delete',
        type: [String],
        example: ['clxxx1', 'clxxx2'],
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    public readonly ids: string[];
}
