import { NotFoundException } from '@nestjs/common';

export class FcmTokenNotFoundException extends NotFoundException {
    public constructor() {
        super('FCM token not found');
    }
}
