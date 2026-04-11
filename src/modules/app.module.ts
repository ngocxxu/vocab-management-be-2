import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { envConfigLoaders, validationSchema } from '../config';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ThrottlerModule, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { AiModule } from './ai';
import { AuthModule } from './auth';
import { CloudinaryModule } from './cloudinary';
import { ConfigModule } from './config';
import { EmailModule } from './email';
import { EventsModule } from './event';
import { FcmModule } from './fcm';
import { LanguageModule } from './language';
import { LanguageFolderModule } from './language-folder';
import { NotificationModule } from './notification';
import { PlanModule } from './plan';
import { ReminderModule } from './reminder';
import { AuthGuard, SharedModule, UserThrottlerGuard } from './shared';
import { SSEModule } from './sse';
import { SubjectModule } from './subject';
import { UserModule } from './user';
import { VocabModule } from './vocab';
import { VocabTrainerModule } from './vocab-trainer';
import { WebhookModule } from './webhook';
import { WordTypeModule } from './word-type';

@Module({
    imports: [
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
        BullBoardModule.forRoot({
            route: '/admin/queues',
            adapter: ExpressAdapter,
        }),
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
        SharedModule,
        AuthModule,
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
        FcmModule,
        EventsModule,
        WebhookModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
        {
            provide: APP_GUARD,
            useClass: UserThrottlerGuard,
        },
    ],
})
export class ApplicationModule {}
