import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CommonModule } from './common';
import { LanguageModule } from './language/language.module';
import { UserModule } from './user/user.module';
import { VocabModule } from './vocab/vocab.module';

@Module({
    imports: [CommonModule, AuthModule, UserModule, VocabModule, LanguageModule],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class ApplicationModule {}
