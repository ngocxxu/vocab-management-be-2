import { Module } from '@nestjs/common';
import { AiService } from './service/ai.service';

@Module({
    providers: [AiService],
    exports: [AiService],
})
export class AiModule {}
