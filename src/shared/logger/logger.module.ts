import { CommonModule } from '@/common/common.module';
import { Global, Module } from '@nestjs/common';

import { LogInterceptor } from '../interceptors/log.interceptor';
import { LoggerService } from '../services/logger.service';

@Global()
@Module({
    imports: [CommonModule],
    providers: [LoggerService, LogInterceptor],
    exports: [LoggerService, LogInterceptor],
})
export class LoggerModule {}
