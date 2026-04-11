import { NotFoundException } from '@nestjs/common';

export class WordTypeNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`Word type with ID ${id} not found`);
    }
}
