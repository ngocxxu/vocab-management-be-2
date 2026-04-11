import { ForbiddenException } from '@nestjs/common';

export class NotificationForbiddenException extends ForbiddenException {
    public constructor() {
        super('User is not a recipient of this notification');
    }
}
