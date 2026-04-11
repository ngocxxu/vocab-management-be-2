import { Module } from '@nestjs/common';

import { WebhookController } from './controllers';
import { WebhookService } from './services';

@Module({
    controllers: [WebhookController],
    providers: [WebhookService],
})
export class WebhookModule {}
