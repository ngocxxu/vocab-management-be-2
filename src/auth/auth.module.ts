import { UserModule } from '@/domains/identity/user/user.module';
import { SupabaseModule } from '@/domains/media/supabase';
import { Module } from '@nestjs/common';

import { CombinedAuthGuard, GlobalAuthGuard, RolesGuard, SupabaseAuthGuard } from './guards';
import { Auth0JwksProvider, AuthIdentityService, AuthTokenService, WsAuthService } from './services';

@Module({
    imports: [SupabaseModule, UserModule],
    providers: [Auth0JwksProvider, AuthIdentityService, AuthTokenService, WsAuthService, GlobalAuthGuard, SupabaseAuthGuard, CombinedAuthGuard, RolesGuard],
    exports: [AuthIdentityService, AuthTokenService, WsAuthService, GlobalAuthGuard, SupabaseAuthGuard, CombinedAuthGuard, RolesGuard],
})
export class AuthModule {}
