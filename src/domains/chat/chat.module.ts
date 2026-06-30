import { AuthModule } from '@/auth';
import { AiModule } from '@/domains/ai';
import { LanguageModule } from '@/domains/catalog/language';
import { LanguageFolderModule } from '@/domains/catalog/language-folder';
import { SubjectModule } from '@/domains/catalog/subject';
import { WordTypeModule } from '@/domains/catalog/word-type';
import { UserModule } from '@/domains/identity/user';
import { NotificationModule } from '@/domains/notification';
import { ReminderModule } from '@/domains/reminder';
import { VocabModule } from '@/domains/vocab';
import { VocabTrainerModule } from '@/domains/vocab-trainer';
import { Module } from '@nestjs/common';
import { ChatController } from './controllers';
import { ChatBotGateway } from './gateway/chat-bot.gateway';
import { ChatProcessor } from './processors/chat.processor';
import { ChatMessageRepository } from './repositories';
import { AbortControllerRegistry, ChatService, McpToolRegistry } from './services';

@Module({
    imports: [
        AuthModule,
        AiModule,
        UserModule,
        VocabModule,
        VocabTrainerModule,
        LanguageModule,
        LanguageFolderModule,
        SubjectModule,
        WordTypeModule,
        NotificationModule,
        ReminderModule,
    ],
    controllers: [ChatController],
    providers: [ChatService, ChatMessageRepository, ChatBotGateway, ChatProcessor, McpToolRegistry, AbortControllerRegistry],
})
export class ChatModule {}
