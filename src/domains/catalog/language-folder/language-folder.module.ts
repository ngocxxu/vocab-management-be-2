import { Module, forwardRef } from '@nestjs/common';
import { PlanModule } from '../plan';
import { LanguageFolderController } from './controllers';
import { LanguageFolderRepository } from './repositories';
import { LanguageFolderService } from './services';

@Module({
    imports: [forwardRef(() => PlanModule)],
    controllers: [LanguageFolderController],
    providers: [LanguageFolderRepository, LanguageFolderService],
    exports: [LanguageFolderService, LanguageFolderRepository],
})
export class LanguageFolderModule {}

