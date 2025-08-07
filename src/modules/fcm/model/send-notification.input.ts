import { PickType } from '@nestjs/swagger';
import { NotificationDto } from './notification.dto';

export class SendNotificationInput extends PickType(NotificationDto, [
    'title',
    'body',
    'data',
    'imageUrl',
    'priority',
] as const) {}
