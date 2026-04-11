import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CacheController, HealthController } from './controller';
import { LogInterceptor } from './flow';
import { LoggerService, PrismaService } from './provider';
import { RedisService } from './provider/redis.provider';
import { CacheManagerService } from './service/cache-manager.service';

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
export class CommonModule {}
