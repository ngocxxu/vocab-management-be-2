import { AuthModule } from '@/auth';
import { VocabModule } from '@/domains/vocab';
import { Module } from '@nestjs/common';

import { McpController } from './controllers';
import { McpAuthGuard, McpEnabledGuard, McpRequestGuard } from './guards';
import { McpServerService, PublicMcpToolRegistry } from './services';

@Module({
    imports: [AuthModule, VocabModule],
    controllers: [McpController],
    providers: [PublicMcpToolRegistry, McpServerService, McpEnabledGuard, McpRequestGuard, McpAuthGuard],
})
export class McpModule {}
