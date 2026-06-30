import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { ChatMessage, ChatRole, Prisma } from '@prisma/client';
import { CHAT_HISTORY_DEFAULT_LIMIT } from '../constants';

@Injectable()
export class ChatMessageRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async create(
        userId: string,
        role: ChatRole,
        message: string,
        toolCalls?: Array<{ toolName: string; success: boolean; latencyMs: number }>,
        tokenCount?: number,
        latencyMs?: number,
    ): Promise<ChatMessage> {
        return this.prisma.chatMessage.create({
            data: {
                userId,
                role,
                message,
                ...(toolCalls !== undefined && { toolCalls: toolCalls as unknown as Prisma.InputJsonValue }),
                ...(tokenCount !== undefined && { tokenCount }),
                ...(latencyMs !== undefined && { latencyMs }),
            },
        });
    }

    public async findLastN(userId: string, n: number): Promise<ChatMessage[]> {
        const rows = await this.prisma.chatMessage.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: n,
        });
        return rows.reverse();
    }

    public async findByUserCursor(userId: string, cursor?: string, limit = CHAT_HISTORY_DEFAULT_LIMIT): Promise<ChatMessage[]> {
        return this.prisma.chatMessage.findMany({
            where: {
                userId,
                ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    public async countUnread(userId: string, since: Date | null): Promise<number> {
        return this.prisma.chatMessage.count({
            where: {
                userId,
                role: ChatRole.ASSISTANT,
                ...(since ? { createdAt: { gt: since } } : {}),
            },
        });
    }

    public async markAllRead(userId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { chatLastReadAt: new Date() },
        });
    }

    public async deleteAllByUser(userId: string): Promise<number> {
        const result = await this.prisma.chatMessage.deleteMany({ where: { userId } });
        return result.count;
    }
}
