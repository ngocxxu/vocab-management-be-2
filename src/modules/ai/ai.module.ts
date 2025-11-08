import { Module } from '@nestjs/common';
import { ConfigModule } from '../config';
import { AiService } from './service/ai.service';

@Module({
    imports: [ConfigModule],
    providers: [AiService],
    exports: [AiService],
})
export class AiModule {}
