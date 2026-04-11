import { Module } from '@nestjs/common';

import { FcmModule } from '@/domains/notification/push/fcm/fcm.module';

import { ExampleAuthDecoratorsController } from './controllers/example-auth-decorators.controller';
import {
    CombinedAuthGuard,
    FirebaseAuthGuard,
    GlobalAuthGuard,
    JwtAuthGuard,
    RolesGuard,
} from './guards';
import { AuthTokenService } from './services';

const exampleControllers =
    process.env.AUTH_EXAMPLE_ROUTES_ENABLED === 'true' ? [ExampleAuthDecoratorsController] : [];

@Module({
    imports: [FcmModule],
    controllers: exampleControllers,
    providers: [
        AuthTokenService,
        GlobalAuthGuard,
        JwtAuthGuard,
        FirebaseAuthGuard,
        CombinedAuthGuard,
        RolesGuard,
    ],
    exports: [
        AuthTokenService,
        GlobalAuthGuard,
        JwtAuthGuard,
        FirebaseAuthGuard,
        CombinedAuthGuard,
        RolesGuard,
    ],
})
export class AuthModule {}
