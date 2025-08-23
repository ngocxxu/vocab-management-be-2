import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { LanguageFolderController } from './controller';
import { LanguageFolderService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [LanguageFolderController],
    providers: [LanguageFolderService],
    exports: [LanguageFolderService],
})
export class LanguageFolderModule {}

