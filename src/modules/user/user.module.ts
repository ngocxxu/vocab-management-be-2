import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { UserController } from './controller';
import { UserService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        UserService
    ],
    controllers: [
        UserController
    ],
    exports: []
})
export class UserModule { }
