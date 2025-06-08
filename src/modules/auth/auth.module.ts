import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { AuthController } from './controller';
import { AuthService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        AuthService
    ],
    controllers: [
        AuthController
    ],
    exports: []
})
export class AuthModule { }
