import { ConflictException } from '@nestjs/common';

export class FcmTokenInactiveException extends ConflictException {
    public constructor() {
        super('FCM token is already inactive');
    }
}
