import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { UserController } from './controller';
import { UserRepository } from './repository';
import { UserService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        UserRepository,
        UserService
    ],
    controllers: [
        UserController
    ],
    exports: []
})
export class UserModule { }
