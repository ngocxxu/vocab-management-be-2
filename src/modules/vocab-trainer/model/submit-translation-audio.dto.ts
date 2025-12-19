import { ApiProperty } from '@nestjs/swagger';
import { SubmitExamInput } from './submit-exam.dto';

export class SubmitTranslationAudioInput extends SubmitExamInput {
    @ApiProperty({ description: 'Cloudinary fileId (publicId)' })
    public fileId: string;

    @ApiProperty({ description: 'Target style (optional)', required: false })
    public targetStyle?: 'formal' | 'informal';

    @ApiProperty({ description: 'Target audience (optional)', required: false })
    public targetAudience?: string;
}














