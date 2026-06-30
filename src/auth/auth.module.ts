import { UserModule } from '@/domains/identity/user/user.module';
import { SupabaseModule } from '@/domains/media/supabase';
import { Module } from '@nestjs/common';

import { ExampleAuthDecoratorsController } from './controllers/example-auth-decorators.controller';
import { CombinedAuthGuard, GlobalAuthGuard, JwtAuthGuard, RolesGuard, SupabaseAuthGuard } from './guards';
import { AuthTokenService, WsAuthService } from './services';

const exampleControllers = process.env.AUTH_EXAMPLE_ROUTES_ENABLED === 'true' ? [ExampleAuthDecoratorsController] : [];

@Module({
    imports: [SupabaseModule, UserModule],
    controllers: exampleControllers,
    providers: [AuthTokenService, WsAuthService, GlobalAuthGuard, JwtAuthGuard, SupabaseAuthGuard, CombinedAuthGuard, RolesGuard],
    exports: [AuthTokenService, WsAuthService, GlobalAuthGuard, JwtAuthGuard, SupabaseAuthGuard, CombinedAuthGuard, RolesGuard],
})
export class AuthModule {}
