import { NotFoundException } from '@nestjs/common';

export class VocabNotFoundException extends NotFoundException {
    public constructor(id: string | number) {
        super(`Vocab with identifier "${id}" was not found`);
    }
}
