import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CacheController, HealthController } from './controllers';
import { LoggerModule } from './logger';
import { PrismaModule } from './prisma';
import { CacheManagerService, RedisService } from './services';

@Global()
@Module({
    imports: [PrismaModule, LoggerModule, TerminusModule],
    providers: [RedisService, CacheManagerService],
    exports: [PrismaModule, LoggerModule, RedisService, CacheManagerService],
    controllers: [HealthController, CacheController],
})
export class SharedModule {}
