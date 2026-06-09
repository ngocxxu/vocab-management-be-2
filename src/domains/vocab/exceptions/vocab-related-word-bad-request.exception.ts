import { BadRequestException } from '@nestjs/common';

export class VocabRelatedWordBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
