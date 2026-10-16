import { Module } from '@nestjs/common';

import { UserController } from './controllers';
import { UserIdentityRepository, UserRepository } from './repositories';
import { UserService } from './services';

@Module({
    imports: [],
    providers: [UserRepository, UserIdentityRepository, UserService],
    controllers: [UserController],
    exports: [UserService, UserRepository, UserIdentityRepository],
})
export class UserModule {}
