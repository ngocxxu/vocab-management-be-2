import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { LanguageController } from './controller';
import { LanguageService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [LanguageController],
    providers: [LanguageService],
    exports: [LanguageService],
})
export class LanguageModule {}
