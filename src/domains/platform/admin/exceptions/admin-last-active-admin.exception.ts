import { ConflictException } from '@nestjs/common';

/** The change would leave the system with no active admin. */
export class AdminLastActiveAdminException extends ConflictException {
    public constructor() {
        super('There must be at least one active admin');
    }
}
