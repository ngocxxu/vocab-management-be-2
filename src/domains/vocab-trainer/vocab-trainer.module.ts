import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { LanguageModule } from '../catalog/language';
import { NotificationModule } from '../notification';
import { ConfigModule } from '../platform/config/config.module';
import { ReminderModule } from '../reminder';
import { VocabModule } from '../vocab';
import { SrsSettingsController, VocabTrainerController } from './controllers';
import { VocabTrainerRepository } from './repositories';
import { FsrsDefaultsService, VocabTrainerService } from './services';

@Module({
    imports: [forwardRef(() => ReminderModule), forwardRef(() => AiModule), LanguageModule, NotificationModule, VocabModule, ConfigModule],
    controllers: [VocabTrainerController, SrsSettingsController],
    providers: [VocabTrainerRepository, VocabTrainerService, FsrsDefaultsService],
    exports: [VocabTrainerService, VocabTrainerRepository],
})
export class VocabTrainerModule {}
