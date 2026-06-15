import { NotFoundException } from '@nestjs/common';

export class TextTargetNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`TextTarget with identifier "${id}" was not found`);
    }
}
