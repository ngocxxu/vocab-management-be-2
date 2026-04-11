import { BadRequestException } from '@nestjs/common';

export class SubjectBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
