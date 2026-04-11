import { Module } from '@nestjs/common';
import { FirebaseConfig, FirebaseService } from '../../firebase';
import { FcmController } from './controllers';
import { FcmService } from './services';

@Module({
    imports: [],
    controllers: [FcmController],
    providers: [FcmService, FirebaseConfig, FirebaseService],
    exports: [FcmService, FirebaseService],
})
export class FcmModule {}
