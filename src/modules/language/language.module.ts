import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { LanguageController } from './controller';
import { LanguageRepository } from './repository';
import { LanguageService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [LanguageController],
    providers: [LanguageRepository, LanguageService],
    exports: [LanguageService],
})
export class LanguageModule {}
