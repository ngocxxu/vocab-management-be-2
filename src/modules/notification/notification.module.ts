import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { SSEModule } from '../sse/sse.module';
import { NotificationController } from './controller';
import { NotificationProcessor } from './processor';
import { NotificationService } from './service';

@Module({
    imports: [CommonModule, SSEModule],
    controllers: [NotificationController],
    providers: [NotificationService, NotificationProcessor],
    exports: [NotificationService],
})
export class NotificationModule {}
