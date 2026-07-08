import { LanguageFolderModule } from '@/domains/catalog/language-folder';
import { Module } from '@nestjs/common';
import { ApiKeyController } from './controllers';
import { ApiKeyRepository } from './repositories';
import { ApiKeyService } from './services';

@Module({
    imports: [LanguageFolderModule],
    controllers: [ApiKeyController],
    providers: [ApiKeyRepository, ApiKeyService],
    exports: [ApiKeyService, ApiKeyRepository],
})
export class ApiKeyModule {}
