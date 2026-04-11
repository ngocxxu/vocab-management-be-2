import { AuthModule as AppAuthModule, GlobalAuthGuard } from '@/auth';
import { CommonModule } from '@/common/common.module';

import { AiModule } from '@/domains/ai';
import { LanguageModule } from '@/domains/catalog/language';
import { LanguageFolderModule } from '@/domains/catalog/language-folder';
import { PlanModule } from '@/domains/catalog/plan';
import { SubjectModule } from '@/domains/catalog/subject';
import { WordTypeModule } from '@/domains/catalog/word-type';
import { AuthModule as IdentityAuthModule } from '@/domains/identity/auth';
import { UserModule } from '@/domains/identity/user';
import { CloudinaryModule } from '@/domains/media/cloudinary';
import { SupabaseModule } from '@/domains/media/supabase';
import { EmailModule, NotificationModule } from '@/domains/notification';
import { AdminModule } from '@/domains/platform/admin';
import { ConfigModule } from '@/domains/platform/config';
import { EventsModule } from '@/domains/platform/events';
import { SSEModule } from '@/domains/platform/sse';
import { WebhookModule } from '@/domains/platform/webhook';
import { ReminderModule } from '@/domains/reminder';
import { VocabModule } from '@/domains/vocab';
import { VocabTrainerModule } from '@/domains/vocab-trainer';
import { QueuesModule } from '@/queues/queues.module';
import { SharedModule, UserThrottlerGuard } from '@/shared';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { envConfigLoaders, validationSchema } from '../config';

@Module({
    imports: [
        CommonModule,
        NestConfigModule.forRoot({
            isGlobal: true,
            load: envConfigLoaders,
            validationSchema,
            validationOptions: { abortEarly: false, allowUnknown: true },
        }),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                redis: configService.getOrThrow<string>('redis.url'),
            }),
        }),
        QueuesModule,
        AdminModule,
        ThrottlerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService): ThrottlerModuleOptions => ({
                throttlers: [
                    {
                        ttl: 60000,
                        limit: 50,
                    },
                ],
                storage: new ThrottlerStorageRedisService(configService.getOrThrow<string>('redis.url')) as unknown as ThrottlerStorage,
            }),
        }),
        SupabaseModule,
        SharedModule,
        AppAuthModule,
        IdentityAuthModule,
        ConfigModule,
        CloudinaryModule,
        AiModule,
        UserModule,
        LanguageModule,
        LanguageFolderModule,
        PlanModule,
        SubjectModule,
        WordTypeModule,
        VocabModule,
        VocabTrainerModule,
        EmailModule,
        NotificationModule,
        ReminderModule,
        SSEModule,
        EventsModule,
        WebhookModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: GlobalAuthGuard,
        },
        {
            provide: APP_GUARD,
            useClass: UserThrottlerGuard,
        },
    ],
})
export class ApplicationModule {}
