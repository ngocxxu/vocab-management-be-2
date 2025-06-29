import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CommonModule } from './common';
import { UserModule } from './user/user.module';
import { VocabModule } from './vocab/vocab.module';

@Module({
    imports: [CommonModule,  AuthModule, UserModule, VocabModule],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class ApplicationModule {}
