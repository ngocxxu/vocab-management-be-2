import { InternalServerErrorException } from '@nestjs/common';

export class AiGenerationException extends InternalServerErrorException {
    public constructor(detail?: string) {
        super(detail ?? 'AI generation encountered an unexpected error');
    }
}
