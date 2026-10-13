import { BadRequestException } from '@nestjs/common';

export class NotificationNoRecipientsException extends BadRequestException {
    public constructor() {
        super('No active users match this broadcast target');
    }
}
