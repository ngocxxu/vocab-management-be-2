import { ConflictException } from '@nestjs/common';

export class UserAlreadyExistsException extends ConflictException {
    public constructor(email: string) {
        super(`An account with email "${email}" already exists`);
    }
}
