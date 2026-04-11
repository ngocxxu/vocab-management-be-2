import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CacheController, HealthController } from './controllers';
import { LogInterceptor } from './interceptors';
import { CacheManagerService, LoggerService, PrismaService, RedisService } from './services';

@Global()
@Module({
    imports: [TerminusModule],
    providers: [
        LoggerService,
        LogInterceptor,
        PrismaService,
        RedisService,
        CacheManagerService,
    ],
    exports: [
        LoggerService,
        LogInterceptor,
        PrismaService,
        RedisService,
        CacheManagerService,
    ],
    controllers: [HealthController, CacheController],
})
export class SharedModule {}
