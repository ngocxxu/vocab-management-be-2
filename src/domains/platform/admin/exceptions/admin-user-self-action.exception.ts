import { BadRequestException } from '@nestjs/common';

/** An admin tried to change or delete their own account from the admin panel. */
export class AdminUserSelfActionException extends BadRequestException {
    public constructor(action: 'change' | 'delete') {
        super(action === 'delete' ? 'You cannot delete your own account' : 'You cannot change your own role or status');
    }
}
