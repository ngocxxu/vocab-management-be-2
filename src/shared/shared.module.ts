import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CacheController, HealthController } from './controllers';
import { LoggerModule } from './logger';
import { PrismaModule } from './prisma';
import { CacheManagerService, RedisPubSubService, RedisService } from './services';

@Global()
@Module({
    imports: [PrismaModule, LoggerModule, TerminusModule],
    providers: [RedisService, CacheManagerService, RedisPubSubService],
    exports: [PrismaModule, LoggerModule, RedisService, CacheManagerService, RedisPubSubService],
    controllers: [HealthController, CacheController],
})
export class SharedModule {}
