import { NotFoundException } from '@nestjs/common';

export class UserNotFoundException extends NotFoundException {
    public constructor(supabaseUserId: string) {
        super(`User with ID ${supabaseUserId} was not found`);
    }
}

export class UserNotFoundInDatabaseException extends NotFoundException {
    public constructor() {
        super('User not found in local database');
    }
}
