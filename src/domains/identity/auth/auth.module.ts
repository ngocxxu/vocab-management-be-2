import { Module } from '@nestjs/common';
import { UserModule } from '../user';
import { AuthController } from './controllers';
import { AuthService } from './services';

@Module({
    imports: [UserModule],
    providers: [AuthService],
    controllers: [AuthController],
    exports: [],
})
export class AuthModule {}
