import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CacheController, HealthController } from './controllers';
import { LogInterceptor } from './interceptors';
import { SupabaseAuthProvider, SupabaseStorageProvider } from './providers';
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
        SupabaseStorageProvider,
        SupabaseAuthProvider,
    ],
    exports: [
        LoggerService,
        LogInterceptor,
        PrismaService,
        RedisService,
        CacheManagerService,
        SupabaseStorageProvider,
        SupabaseAuthProvider,
    ],
    controllers: [HealthController, CacheController],
})
export class SharedModule {}
