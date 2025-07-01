import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CommonModule } from './common';
import { LanguageModule } from './language/language.module';
import { SubjectModule } from './subject/subject.module';
import { UserModule } from './user/user.module';
import { VocabModule } from './vocab/vocab.module';
import { WordTypeModule } from './word-type/word-type.module';

@Module({
    imports: [
        CommonModule,
        AuthModule,
        UserModule,
        LanguageModule,
        SubjectModule,
        WordTypeModule,
        VocabModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class ApplicationModule {}
