import { UserModule } from '@/domains/identity/user/user.module';
import { SupabaseModule } from '@/domains/media/supabase';
import { Module } from '@nestjs/common';

import { CombinedAuthGuard, GlobalAuthGuard, JwtAuthGuard, RolesGuard, SupabaseAuthGuard } from './guards';
import { AuthTokenService, WsAuthService } from './services';

@Module({
    imports: [SupabaseModule, UserModule],
    providers: [AuthTokenService, WsAuthService, GlobalAuthGuard, JwtAuthGuard, SupabaseAuthGuard, CombinedAuthGuard, RolesGuard],
    exports: [AuthTokenService, WsAuthService, GlobalAuthGuard, JwtAuthGuard, SupabaseAuthGuard, CombinedAuthGuard, RolesGuard],
})
export class AuthModule {}
