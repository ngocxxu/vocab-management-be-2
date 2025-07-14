import { ApiProperty } from '@nestjs/swagger';
import { VocabTrainerInput } from './vocab-trainer.input';

export class UpdateVocabTrainerInput extends VocabTrainerInput {
    @ApiProperty({ description: 'IDs of vocabs which user choose to exam', required: false, type: [String] })
    public vocabChosenIds?: string[];
}