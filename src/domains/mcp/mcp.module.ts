import { AuthModule } from '@/auth';
import { LanguageFolderModule } from '@/domains/catalog/language-folder/language-folder.module';
import { SubjectModule } from '@/domains/catalog/subject/subject.module';
import { WordTypeModule } from '@/domains/catalog/word-type/word-type.module';
import { VocabModule } from '@/domains/vocab';
import { Module } from '@nestjs/common';

import { McpController } from './controllers';
import { McpAuthGuard, McpEnabledGuard, McpRequestGuard } from './guards';
import { McpServerService, PublicMcpToolRegistry } from './services';

@Module({
    imports: [AuthModule, VocabModule, SubjectModule, LanguageFolderModule, WordTypeModule],
    controllers: [McpController],
    providers: [PublicMcpToolRegistry, McpServerService, McpEnabledGuard, McpRequestGuard, McpAuthGuard],
})
export class McpModule {}
