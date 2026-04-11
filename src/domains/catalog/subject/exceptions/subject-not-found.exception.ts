import { NotFoundException } from '@nestjs/common';

export class SubjectNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`Subject with ID ${id} not found`);
    }
}
