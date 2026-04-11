import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { SSEModule } from '@/domains/platform/sse';

import { EReminderType } from '../reminder/utils';
import { FcmModule } from './push';
import { NotificationController } from './controllers';
import { NotificationFcmProcessor } from './processors/notification-fcm.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationRepository } from './repositories';
import { NotificationFcmService } from './services/notification-fcm.service';
import { NotificationService } from './services/notification.service';

const notificationQueue = BullModule.registerQueue({
    name: EReminderType.NOTIFICATION,
});

const notificationFcmQueue = BullModule.registerQueue({
    name: EReminderType.NOTIFICATION_FCM,
});

@Module({
    imports: [
        notificationQueue,
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION,
            adapter: BullAdapter,
        }),
        notificationFcmQueue,
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION_FCM,
            adapter: BullAdapter,
        }),
        SSEModule,
        FcmModule,
    ],
    controllers: [NotificationController],
    providers: [
        NotificationRepository,
        NotificationService,
        NotificationProcessor,
        NotificationFcmService,
        NotificationFcmProcessor,
    ],
    exports: [NotificationService, notificationQueue, notificationFcmQueue],
})
export class NotificationModule {}
