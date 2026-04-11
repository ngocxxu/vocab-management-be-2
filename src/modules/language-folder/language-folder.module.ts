import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { LanguageFolderController } from './controllers';
import { LanguageFolderRepository } from './repositories';
import { LanguageFolderService } from './services';

@Module({
    imports: [PlanModule],
    controllers: [LanguageFolderController],
    providers: [LanguageFolderRepository, LanguageFolderService],
    exports: [LanguageFolderService],
})
export class LanguageFolderModule {}

