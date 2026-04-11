import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ThrottlerModule, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

import { CommonModule } from '@/common/common.module';

import { AuthModule as AppAuthModule, GlobalAuthGuard } from '@/auth';

import { envConfigLoaders, validationSchema } from '../config';
import { AiModule } from '@/domains/ai';
import { AuthModule as IdentityAuthModule } from '@/domains/identity/auth';
import { UserModule } from '@/domains/identity/user';
import { CloudinaryModule } from '@/domains/media/cloudinary';
import { SupabaseModule } from '@/domains/media/supabase';
import { EmailModule, NotificationModule } from '@/domains/notification';
import { LanguageFolderModule } from '@/domains/catalog/language-folder';
import { LanguageModule } from '@/domains/catalog/language';
import { PlanModule } from '@/domains/catalog/plan';
import { SubjectModule } from '@/domains/catalog/subject';
import { WordTypeModule } from '@/domains/catalog/word-type';
import { ConfigModule } from '@/domains/platform/config';
import { AdminModule } from '@/domains/platform/admin';
import { EventsModule } from '@/domains/platform/events';
import { SSEModule } from '@/domains/platform/sse';
import { WebhookModule } from '@/domains/platform/webhook';
import { ReminderModule } from '@/domains/reminder';
import { VocabTrainerModule } from '@/domains/vocab-trainer';
import { VocabModule } from '@/domains/vocab';
import { SharedModule, UserThrottlerGuard } from '@/shared';

@Module({
    imports: [
        CommonModule,
        NestConfigModule.forRoot({
            isGlobal: true,
            load: envConfigLoaders,
            validationSchema,
            validationOptions: { abortEarly: false },
        }),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                redis: configService.getOrThrow<string>('redis.url'),
            }),
        }),
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
                storage: new ThrottlerStorageRedisService(
                    configService.getOrThrow<string>('redis.url'),
                ) as unknown as ThrottlerStorage,
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
