import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

const MAX_VOCAB_IDS = 100;

/** Words the user wants to check for trainer conflicts, e.g. the words of a failed delete. */
export class VocabConflictByTrainerQuery {
    @ApiProperty({
        description: `Comma-separated vocab IDs (max ${MAX_VOCAB_IDS})`,
        example: 'cmcvuc64d00002dtxq5tkcl27,cmcvuc64d00012dtxq5tkcl28',
        type: String,
    })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string'
            ? value
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
            : value,
    )
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(MAX_VOCAB_IDS)
    @IsString({ each: true })
    public readonly vocabIds!: string[];
}
