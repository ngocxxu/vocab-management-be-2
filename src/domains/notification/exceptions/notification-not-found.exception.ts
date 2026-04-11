import { NotFoundException } from '@nestjs/common';

export class NotificationNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`Notification with ID ${id} not found`);
    }
}
