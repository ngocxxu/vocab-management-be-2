import { SSEModule } from '@/domains/platform/sse';
import { Module } from '@nestjs/common';
import { NotificationController } from './controllers';
import { NotificationFcmProcessor } from './processors/notification-fcm.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { FcmModule } from './push';
import { NotificationRepository } from './repositories';
import { NotificationFcmService } from './services/notification-fcm.service';
import { NotificationService } from './services/notification.service';

@Module({
    imports: [SSEModule, FcmModule],
    controllers: [NotificationController],
    providers: [NotificationRepository, NotificationService, NotificationProcessor, NotificationFcmService, NotificationFcmProcessor],
    exports: [NotificationService, NotificationFcmService],
})
export class NotificationModule {}
