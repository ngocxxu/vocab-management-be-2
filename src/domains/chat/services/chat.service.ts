import { AiChatProducer } from '@/queues/producers/ai-chat.producer';
import { LoggerService, PrismaService, RedisPrefix, RedisService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { CHAT_CANCEL_KEY, CHAT_CANCEL_TTL_SECONDS, CHAT_GREETING_MESSAGE, CHAT_HISTORY_DEFAULT_LIMIT, CHAT_HISTORY_MAX_LIMIT } from '../constants';
import { ChatMessageDto } from '../dto';
import { ChatMessageRepository } from '../repositories';

@Injectable()
export class ChatService {
    public constructor(
        private readonly chatMessageRepository: ChatMessageRepository,
        private readonly aiChatProducer: AiChatProducer,
        private readonly redisService: RedisService,
        private readonly prisma: PrismaService,
        private readonly logger: LoggerService,
    ) {}

    public async saveAndEnqueue(userId: string, content: string, tier: string): Promise<string> {
        await this.redisService.del(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId));
        const message = await this.chatMessageRepository.create(userId, ChatRole.USER, content);
        const { jobId } = await this.aiChatProducer.addChatJob({ userId, messageId: message.id, tier });
        this.logger.info(`Chat job enqueued: jobId=${jobId} userId=${userId} messageId=${message.id}`);
        return message.id;
    }

    public async getHistory(userId: string, cursor?: string, limit?: number): Promise<{ items: ChatMessageDto[]; nextCursor: string | null }> {
        const take = Math.min(limit ?? CHAT_HISTORY_DEFAULT_LIMIT, CHAT_HISTORY_MAX_LIMIT);
        const messages = await this.chatMessageRepository.findByUserCursor(userId, cursor, take);
        const oldestMessage = messages[messages.length - 1];
        const nextCursor = messages.length === take && oldestMessage ? oldestMessage.createdAt.toISOString() : null;
        const items = messages.reverse().map((m) => new ChatMessageDto(m));
        return { items, nextCursor };
    }

    public async ensureGreeting(userId: string): Promise<ChatMessageDto | null> {
        const existing = await this.chatMessageRepository.findByUserCursor(userId, undefined, 1);
        if (existing.length === 0) {
            const message = await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, CHAT_GREETING_MESSAGE);
            this.logger.info(`Greeting created for userId=${userId}`);
            return new ChatMessageDto(message);
        }
        return null;
    }

    public async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { chatLastReadAt: true } });
        const unreadCount = await this.chatMessageRepository.countUnread(userId, user?.chatLastReadAt ?? null);
        return { unreadCount };
    }

    public async markAsRead(userId: string): Promise<void> {
        await this.chatMessageRepository.markAllRead(userId);
    }

    public async deleteHistory(userId: string): Promise<void> {
        await this.chatMessageRepository.deleteAllByUser(userId);
        await this.redisService.set(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId), '1', CHAT_CANCEL_TTL_SECONDS);
        this.logger.info(`Chat history deleted and cancel flag set for userId=${userId}`);
    }
}
