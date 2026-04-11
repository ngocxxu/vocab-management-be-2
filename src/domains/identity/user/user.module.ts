import { Module } from '@nestjs/common';

import { UserController } from './controllers';
import { UserRepository } from './repositories';
import { UserService } from './services';

@Module({
    imports: [],
    providers: [UserRepository, UserService],
    controllers: [UserController],
    exports: [UserService, UserRepository],
})
export class UserModule {}
