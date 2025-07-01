import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { NotificationController } from './controller';
import { NotificationService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [NotificationController],
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule {}
