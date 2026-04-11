import { Module } from '@nestjs/common';
import { LanguageController } from './controllers';
import { LanguageRepository } from './repositories';
import { LanguageService } from './services';

@Module({
    imports: [],
    controllers: [LanguageController],
    providers: [LanguageRepository, LanguageService],
    exports: [LanguageService, LanguageRepository],
})
export class LanguageModule {}
