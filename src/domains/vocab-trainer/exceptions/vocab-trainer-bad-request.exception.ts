import { BadRequestException } from '@nestjs/common';

export class VocabTrainerBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
