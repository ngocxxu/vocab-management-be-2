import { Module } from '@nestjs/common';
import { ChatGateway, NotificationGateway } from '../gateway';

@Module({
    providers: [NotificationGateway, ChatGateway],
    exports: [NotificationGateway, ChatGateway],
})
export class EventsModule {}
