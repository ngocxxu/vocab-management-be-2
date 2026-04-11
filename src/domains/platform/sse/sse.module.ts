import { Module } from '@nestjs/common';
import { SSEController } from './controllers';
import { SSEPublisherService, SSEService } from './services';

@Module({
    imports: [],
    controllers: [SSEController],
    providers: [SSEService, SSEPublisherService],
    exports: [SSEPublisherService],
})
export class SSEModule {}