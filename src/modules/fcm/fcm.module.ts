import { Module } from '@nestjs/common';
import { FirebaseConfig, FirebaseService } from '../../firebase';
import { CommonModule } from '../common';
import { FcmController } from './controller';
import { FcmService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [FcmController],
    providers: [FcmService, FirebaseConfig, FirebaseService],
    exports: [FcmService, FirebaseService],
})
export class FcmModule {}
