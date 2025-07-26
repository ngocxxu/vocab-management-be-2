import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { SSEController } from './controller';
import { SSEPublisherService, SSEService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [SSEController],
    providers: [SSEService, SSEPublisherService],
    exports: [SSEPublisherService],
})
export class SSEModule {}