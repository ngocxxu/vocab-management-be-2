import { NotFoundException } from '@nestjs/common';

export class ApiKeyNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`API key with ID ${id} not found`);
    }
}
