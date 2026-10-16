import { Module } from '@nestjs/common';

import { Auth0ManagementModule } from '../auth0-management';

import { UserController } from './controllers';
import { UserIdentityRepository, UserRepository } from './repositories';
import { UserService } from './services';

@Module({
    imports: [Auth0ManagementModule],
    providers: [UserRepository, UserIdentityRepository, UserService],
    controllers: [UserController],
    exports: [UserService, UserRepository, UserIdentityRepository],
})
export class UserModule {}
