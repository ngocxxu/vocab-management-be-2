import { AuthModule as TokenAuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { UserModule } from '../user';
import { AuthController } from './controllers';
import { AccountLinkService, AuthService } from './services';

@Module({
    // TokenAuthModule exports AuthTokenService, which AccountLinkService uses to verify the token of the sign-in method being connected.
    imports: [UserModule, TokenAuthModule],
    providers: [AuthService, AccountLinkService],
    controllers: [AuthController],
    exports: [],
})
export class AuthModule {}
