import { AuthModule } from '@/auth';
import { AiModule } from '@/domains/ai';
import { LanguageModule } from '@/domains/catalog/language';
import { LanguageFolderModule } from '@/domains/catalog/language-folder';
import { SubjectModule } from '@/domains/catalog/subject';
import { UserModule } from '@/domains/identity/user';
import { VocabModule } from '@/domains/vocab';
import { VocabTrainerModule } from '@/domains/vocab-trainer';
import { Module } from '@nestjs/common';
import { ChatController } from './controllers';
import { ChatBotGateway } from './gateway/chat-bot.gateway';
import { ChatProcessor } from './processors/chat.processor';
import { ChatMessageRepository } from './repositories';
import { ChatService, McpToolRegistry } from './services';

@Module({
    imports: [AuthModule, AiModule, UserModule, VocabModule, VocabTrainerModule, LanguageModule, LanguageFolderModule, SubjectModule],
    controllers: [ChatController],
    providers: [ChatService, ChatMessageRepository, ChatBotGateway, ChatProcessor, McpToolRegistry],
})
export class ChatModule {}
