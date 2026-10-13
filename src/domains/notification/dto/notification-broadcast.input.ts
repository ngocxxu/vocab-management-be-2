import { ApiProperty } from '@nestjs/swagger';
import { PriorityLevel, UserRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDate, IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export const BROADCAST_MESSAGE_MAX_LENGTH = 500;

export enum BroadcastTarget {
    ALL = 'ALL',
    ROLE = 'ROLE',
    USERS = 'USERS',
}

export class BroadcastNotificationInput {
    @ApiProperty({ description: 'Message shown in the notification bell', maxLength: BROADCAST_MESSAGE_MAX_LENGTH })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MaxLength(BROADCAST_MESSAGE_MAX_LENGTH)
    public readonly message: string;

    @ApiProperty({ enum: PriorityLevel })
    @IsEnum(PriorityLevel)
    public readonly priority: PriorityLevel;

    @ApiProperty({ description: 'When the message stops showing', example: '2024-12-31T23:59:59Z' })
    @Type(() => Date)
    @IsDate()
    public readonly expiresAt: Date;

    @ApiProperty({ enum: BroadcastTarget, description: 'Who receives the message: all active users, an active role, or selected users' })
    @IsEnum(BroadcastTarget)
    public readonly target: BroadcastTarget;

    @ApiProperty({ enum: UserRole, required: false, description: 'Required when target is ROLE' })
    @ValidateIf((input: BroadcastNotificationInput) => input.target === BroadcastTarget.ROLE)
    @IsEnum(UserRole)
    public readonly role?: UserRole;

    @ApiProperty({ type: [String], required: false, description: 'Required when target is USERS' })
    @ValidateIf((input: BroadcastNotificationInput) => input.target === BroadcastTarget.USERS)
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    public readonly userIds?: string[];
}
