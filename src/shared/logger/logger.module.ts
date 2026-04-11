import { Global, Module } from '@nestjs/common';

import { LogInterceptor } from '../interceptors/log.interceptor';
import { LoggerService } from '../services/logger.service';

@Global()
@Module({
    providers: [LoggerService, LogInterceptor],
    exports: [LoggerService, LogInterceptor],
})
export class LoggerModule {}
