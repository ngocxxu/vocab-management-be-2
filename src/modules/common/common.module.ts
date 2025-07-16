import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './controller';
import { LogInterceptor } from './flow';
import { configProvider, LoggerService, PrismaService } from './provider';
import { RedisService } from './provider/redis.provider';
import { CacheManagerService } from './service/cache-manager.service';

@Module({
  imports: [
    TerminusModule
  ],
  providers: [
    configProvider,
    LoggerService,
    LogInterceptor,
    PrismaService,
    RedisService,
    CacheManagerService,
  ],
  exports: [
    configProvider,
    LoggerService,
    LogInterceptor,
    PrismaService,
    RedisService,
    CacheManagerService,
  ],
  controllers: [
    HealthController
  ],
})
export class CommonModule {}
