import { NotFoundException } from '@nestjs/common';

export class VocabRelatedWordNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`Related word with identifier "${id}" was not found`);
    }
}
