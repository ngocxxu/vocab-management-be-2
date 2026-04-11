import { NotFoundException } from '@nestjs/common';

export class LanguageNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`Language with ID ${id} not found`);
    }
}
