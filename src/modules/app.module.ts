import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CommonModule } from './common';
import { UserModule } from './user/user.module';

@Module({
    imports: [CommonModule,  AuthModule, UserModule],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class ApplicationModule {}
