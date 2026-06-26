import { AiChatProducer } from '@/queues/producers/ai-chat.producer';
import { LoggerService, RedisPrefix, RedisService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { CHAT_CANCEL_KEY, CHAT_CANCEL_TTL_SECONDS, CHAT_HISTORY_DEFAULT_LIMIT, CHAT_HISTORY_MAX_LIMIT } from '../constants';
import { ChatMessageDto } from '../dto';
import { ChatMessageRepository } from '../repositories';

@Injectable()
export class ChatService {
    public constructor(
        private readonly chatMessageRepository: ChatMessageRepository,
        private readonly aiChatProducer: AiChatProducer,
        private readonly redisService: RedisService,
        private readonly logger: LoggerService,
    ) {}

    public async saveAndEnqueue(userId: string, content: string, tier: string): Promise<string> {
        const message = await this.chatMessageRepository.create(userId, ChatRole.USER, content);
        const { jobId } = await this.aiChatProducer.addChatJob({ userId, messageId: message.id, tier });
        this.logger.info(`Chat job enqueued: jobId=${jobId} userId=${userId} messageId=${message.id}`);
        return message.id;
    }

    public async getHistory(userId: string, cursor?: string, limit?: number): Promise<{ items: ChatMessageDto[]; nextCursor: string | null }> {
        const take = Math.min(limit ?? CHAT_HISTORY_DEFAULT_LIMIT, CHAT_HISTORY_MAX_LIMIT);
        const messages = await this.chatMessageRepository.findByUserCursor(userId, cursor, take);
        const items = messages.map((m) => new ChatMessageDto(m));
        const lastMessage = messages[messages.length - 1];
        const nextCursor = messages.length === take && lastMessage ? lastMessage.createdAt.toISOString() : null;
        return { items, nextCursor };
    }

    public async deleteHistory(userId: string): Promise<void> {
        await this.chatMessageRepository.deleteAllByUser(userId);
        await this.redisService.set(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId), '1', CHAT_CANCEL_TTL_SECONDS);
        this.logger.info(`Chat history deleted and cancel flag set for userId=${userId}`);
    }
}
