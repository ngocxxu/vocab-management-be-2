import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { ChatMessage, ChatRole } from '@prisma/client';
import { CHAT_HISTORY_DEFAULT_LIMIT } from '../constants';

@Injectable()
export class ChatMessageRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async create(userId: string, role: ChatRole, content: string): Promise<ChatMessage> {
        return this.prisma.chatMessage.create({
            data: { userId, role, content },
        });
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

    public async deleteAllByUser(userId: string): Promise<number> {
        const result = await this.prisma.chatMessage.deleteMany({ where: { userId } });
        return result.count;
    }
}
