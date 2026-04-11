import { NotFoundException } from '@nestjs/common';

export class LanguageFolderNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`Language folder with ID ${id} not found`);
    }
}
