import { Module } from '@nestjs/common';
import { FirebaseConfig, FirebaseProvider, FirebaseService } from '../firebase';
import { FcmController } from './controllers';
import { UserFcmTokenRepository } from './repositories';
import { FcmService } from './services';

@Module({
    imports: [],
    controllers: [FcmController],
    providers: [UserFcmTokenRepository, FcmService, FirebaseConfig, FirebaseService, FirebaseProvider],
    exports: [FcmService, FirebaseService, FirebaseProvider, FirebaseConfig],
})
export class FcmModule {}
