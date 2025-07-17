import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CommonModule } from './common';
import { EmailModule } from './email/email.module';
import { LanguageModule } from './language/language.module';
import { ReminderModule } from './reminder/reminder.module';
import { EReminderType } from './reminder/util';
import { SubjectModule } from './subject/subject.module';
import { UserModule } from './user/user.module';
import { VocabModule } from './vocab/vocab.module';
import { VocabTrainerModule } from './vocab-trainer/vocab-trainer.module';
import { WordTypeModule } from './word-type/word-type.module';

@Module({
    imports: [
        BullModule.forRoot({
            redis: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT),
            },
        }),
        BullModule.registerQueue({
            name: EReminderType.EMAIL_REMINDER,
        }),
        CommonModule,
        AuthModule,
        UserModule,
        LanguageModule,
        SubjectModule,
        WordTypeModule,
        VocabModule,
        VocabTrainerModule,
        ReminderModule,
        EmailModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class ApplicationModule {}
