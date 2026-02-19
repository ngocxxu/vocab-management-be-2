import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ThrottlerModule, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
// eslint-disable-next-line import/no-extraneous-dependencies
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { AuthGuard, CommonModule } from './common';
import { UserThrottlerGuard } from './common/security/user-throttler.guard';
import { ConfigModule } from './config/config.module';
import { EmailModule } from './email/email.module';
import { EventsModule } from './event/module';
import { FcmModule } from './fcm/fcm.module';
import { LanguageModule } from './language/language.module';
import { LanguageFolderModule } from './language-folder/language-folder.module';
import { NotificationModule } from './notification/notification.module';
import { PlanModule } from './plan/plan.module';
import { ReminderModule } from './reminder/reminder.module';
import { EReminderType } from './reminder/util';
import { SSEModule } from './sse/sse.module';
import { SubjectModule } from './subject/subject.module';
import { UserModule } from './user/user.module';
import { VocabModule } from './vocab/vocab.module';
import { VocabTrainerModule } from './vocab-trainer/vocab-trainer.module';
import { WordTypeModule } from './word-type/word-type.module';

@Module({
    imports: [
        BullModule.forRoot({
            redis: process.env.REDIS_URL,
        }),
        BullBoardModule.forRoot({
            route: '/admin/queues',
            adapter: ExpressAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.EMAIL_REMINDER,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.EMAIL_REMINDER,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.NOTIFICATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.AUDIO_EVALUATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.AUDIO_EVALUATION,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.VOCAB_TRANSLATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.VOCAB_TRANSLATION,
            adapter: BullAdapter,
        }),
        ThrottlerModule.forRootAsync({
            useFactory: (): ThrottlerModuleOptions => ({
                throttlers: [
                    {
                        ttl: 60000,
                        limit: 50,
                    },
                ],
                storage: new ThrottlerStorageRedisService(
                    process.env.REDIS_URL || 'redis://localhost:6379',
                ) as unknown as ThrottlerStorage,
            }),
        }),
        CommonModule,
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
        NotificationModule,
        ReminderModule,
        EmailModule,
        SSEModule,
        FcmModule,
        EventsModule,
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
