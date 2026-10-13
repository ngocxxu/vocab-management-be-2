import { BadRequestException } from '@nestjs/common';

export class NotificationExpiryInPastException extends BadRequestException {
    public constructor() {
        super('Broadcast expiry must be in the future');
    }
}
