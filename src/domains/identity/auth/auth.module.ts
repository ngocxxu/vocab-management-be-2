import { AuthModule as TokenAuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { Auth0ManagementModule } from '../auth0-management';
import { UserModule } from '../user';
import { AuthController } from './controllers';
import { LinkNonceRepository } from './repositories';
import { AccountLinkService, AddPasswordService, AuthService } from './services';

@Module({
    // TokenAuthModule exports AuthTokenService, which AccountLinkService uses to verify the token of the sign-in method being connected.
    imports: [UserModule, TokenAuthModule, Auth0ManagementModule],
    providers: [AuthService, AccountLinkService, AddPasswordService, LinkNonceRepository],
    controllers: [AuthController],
    exports: [],
})
export class AuthModule {}
