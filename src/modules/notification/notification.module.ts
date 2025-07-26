import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { NotificationController } from './controller';
import { NotificationProcessor } from './processor';
import { NotificationService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [NotificationController],
    providers: [NotificationService, NotificationProcessor],
    exports: [NotificationService],
})
export class NotificationModule {}
