import { BadRequestException } from '@nestjs/common';

export class LanguageFolderBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
