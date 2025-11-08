import { ApiProperty } from '@nestjs/swagger';
import { Config, ConfigScope } from '@prisma/client';

export class ConfigDto {
    @ApiProperty({ description: 'Unique identifier for the config' })
    public readonly id: string;

    @ApiProperty({
        description: 'Config scope',
        enum: ConfigScope,
        example: ConfigScope.SYSTEM,
    })
    public readonly scope: ConfigScope;

    @ApiProperty({
        description: 'User ID if this is a user config, null for system config',
        example: null,
        required: false,
    })
    public readonly userId: string | null;

    @ApiProperty({
        description: 'Config key',
        example: 'ai.model',
    })
    public readonly key: string;

    @ApiProperty({
        description: 'Config value (JSON)',
        example: 'gemini-2.0-flash-lite',
    })
    public readonly value: unknown;

    @ApiProperty({
        description: 'Whether the config is active',
        example: true,
    })
    public readonly isActive: boolean;

    @ApiProperty({ description: 'Date when the config was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the config was last updated' })
    public readonly updatedAt: Date;

    public constructor(entity: Config) {
        this.id = entity.id;
        this.scope = entity.scope;
        this.userId = entity.userId;
        this.key = entity.key;
        this.value = entity.value;
        this.isActive = entity.isActive;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}

