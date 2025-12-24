import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { LanguageFolderController } from './controller';
import { LanguageFolderRepository } from './repository';
import { LanguageFolderService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [LanguageFolderController],
    providers: [LanguageFolderRepository, LanguageFolderService],
    exports: [LanguageFolderService],
})
export class LanguageFolderModule {}

