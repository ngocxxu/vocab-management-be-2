import { BadRequestException } from '@nestjs/common';

export class VocabBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
