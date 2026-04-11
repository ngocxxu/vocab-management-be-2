import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { FcmModule } from '../fcm';
import { EReminderType } from '../reminder/utils';
import { SSEModule } from '../sse/sse.module';
import { NotificationController } from './controllers';
import { NotificationFcmProcessor } from './processors/notification-fcm.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationFcmService } from './services/notification-fcm.service';
import { NotificationService } from './services/notification.service';

@Module({
    imports: [
        BullModule.registerQueue({
            name: EReminderType.NOTIFICATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.NOTIFICATION_FCM,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION_FCM,
            adapter: BullAdapter,
        }),
        SSEModule,
        FcmModule,
    ],
    controllers: [NotificationController],
    providers: [
        NotificationService,
        NotificationProcessor,
        NotificationFcmService,
        NotificationFcmProcessor,
    ],
    exports: [NotificationService],
})
export class NotificationModule {}
