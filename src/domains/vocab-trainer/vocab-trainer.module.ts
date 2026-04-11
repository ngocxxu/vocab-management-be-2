import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { LanguageModule } from '../catalog/language';
import { NotificationModule } from '../notification';
import { ReminderModule } from '../reminder';
import { VocabModule } from '../vocab';
import { VocabTrainerController } from './controllers';
import { VocabTrainerRepository } from './repositories';
import { VocabTrainerService } from './services';

@Module({
    imports: [
        forwardRef(() => ReminderModule),
        forwardRef(() => AiModule),
        LanguageModule,
        NotificationModule,
        VocabModule,
    ],
    controllers: [VocabTrainerController],
    providers: [VocabTrainerRepository, VocabTrainerService],
    exports: [VocabTrainerService, VocabTrainerRepository],
})
export class VocabTrainerModule {}
