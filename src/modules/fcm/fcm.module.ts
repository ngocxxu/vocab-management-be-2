import { Module } from '@nestjs/common';
import { FirebaseConfig, FirebaseService } from '../../firebase';
import { FcmController } from './controllers';
import { UserFcmTokenRepository } from './repositories';
import { FcmService } from './services';

@Module({
    imports: [],
    controllers: [FcmController],
    providers: [UserFcmTokenRepository, FcmService, FirebaseConfig, FirebaseService],
    exports: [FcmService, FirebaseService],
})
export class FcmModule {}
