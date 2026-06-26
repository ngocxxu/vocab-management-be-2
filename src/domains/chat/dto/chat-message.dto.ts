import { ApiProperty } from '@nestjs/swagger';
import { ChatMessage, ChatRole } from '@prisma/client';

export class ChatMessageDto {
    @ApiProperty()
    public readonly id: string;

    @ApiProperty({ enum: ChatRole })
    public readonly role: ChatRole;

    @ApiProperty()
    public readonly content: string;

    @ApiProperty({ nullable: true })
    public readonly toolCalls: unknown;

    @ApiProperty()
    public readonly createdAt: string;

    public constructor(entity: ChatMessage) {
        this.id = entity.id;
        this.role = entity.role;
        this.content = entity.content;
        this.toolCalls = entity.toolCalls ?? null;
        this.createdAt = entity.createdAt.toISOString();
    }
}
