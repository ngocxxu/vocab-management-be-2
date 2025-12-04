import { ApiProperty } from '@nestjs/swagger';
import { VocabTrainerDto } from './vocab-trainer.dto';

export class SubmitTranslationAudioResponseDto {
    @ApiProperty({ description: 'Vocab trainer data', type: VocabTrainerDto })
    public trainer: VocabTrainerDto;

    @ApiProperty({ description: 'Job ID for tracking audio evaluation progress' })
    public jobId: string;
}
