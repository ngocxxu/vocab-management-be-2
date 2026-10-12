import { ApiProperty } from '@nestjs/swagger';
import { PriorityLevel } from '@prisma/client';
import { JsonValue } from '@prisma/client/runtime/library';

/** A stored broadcast as the history list reads it. The count stands in for the recipient list, which can be large. */
export type TBroadcastHistoryRow = {
    id: string;
    data: JsonValue;
    priority: PriorityLevel;
    isActive: boolean;
    expiresAt: Date;
    createdAt: Date;
    _count: { notificationRecipients: number };
};

const readMessage = (data: JsonValue): string => {
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.message === 'string') {
        return data.message;
    }

    return '';
};

export class BroadcastHistoryDto {
    @ApiProperty({ description: 'Unique identifier for the broadcast' })
    public readonly id: string;

    @ApiProperty({ description: 'Message shown in the notification bell' })
    public readonly message: string;

    @ApiProperty({ enum: PriorityLevel })
    public readonly priority: PriorityLevel;

    @ApiProperty({ description: 'Whether the broadcast is currently shown' })
    public readonly isActive: boolean;

    @ApiProperty({ description: 'When the message stops showing' })
    public readonly expiresAt: Date;

    @ApiProperty({ description: 'When the broadcast was sent' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'How many users received the broadcast' })
    public readonly recipientCount: number;

    public constructor(entity: TBroadcastHistoryRow) {
        this.id = entity.id;
        this.message = readMessage(entity.data);
        this.priority = entity.priority;
        this.isActive = entity.isActive;
        this.expiresAt = entity.expiresAt;
        this.createdAt = entity.createdAt;
        const { _count: counts } = entity;
        this.recipientCount = counts.notificationRecipients;
    }
}
