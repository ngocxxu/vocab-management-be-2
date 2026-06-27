import { AuthModule } from '@/auth';
import { Module } from '@nestjs/common';

import { ChatGateway, NotificationGateway } from './gateway';

@Module({
    imports: [AuthModule],
    providers: [NotificationGateway, ChatGateway],
    exports: [NotificationGateway, ChatGateway],
})
export class EventsModule {}
