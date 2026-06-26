import { AuthModule } from '@/auth';
import { Module } from '@nestjs/common';
import { ChatController } from './controllers';
import { ChatBotGateway } from './gateway/chat-bot.gateway';
import { ChatProcessor } from './processors/chat.processor';
import { ChatMessageRepository } from './repositories';
import { ChatService } from './services';

@Module({
    imports: [AuthModule],
    controllers: [ChatController],
    providers: [ChatService, ChatMessageRepository, ChatBotGateway, ChatProcessor],
})
export class ChatModule {}
