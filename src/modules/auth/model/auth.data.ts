// eslint-disable-next-line max-classes-per-file
import { ApiProperty } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { OAuthResponse, Provider, Session } from '@supabase/supabase-js';

export class UserDto {
    @ApiProperty({ description: 'User unique ID', example: 'uuid-string' })
    public readonly id: string;

    @ApiProperty({ description: 'User email', example: 'user@example.com' })
    public readonly email: string;

    @ApiProperty({ description: 'User phone number', example: '+1234567890', required: false })
    public readonly phone?: string;

    @ApiProperty({ description: 'User creation date', example: '2024-01-01T00:00:00.000Z' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'User last update date', example: '2024-01-01T00:00:00.000Z' })
    public readonly updatedAt: Date;

    @ApiProperty({ description: 'User first name', example: 'John', required: false })
    public readonly firstName?: string;

    @ApiProperty({ description: 'User last name', example: 'Doe', required: false })
    public readonly lastName?: string;

    @ApiProperty({
        description: 'User avatar URL',
        example: 'https://example.com/avatar.jpg',
        required: false,
    })
    public readonly avatar?: string;

    @ApiProperty({ description: 'User role', enum: UserRole, example: UserRole.CUSTOMER })
    public readonly role: UserRole;

    @ApiProperty({ description: 'User active status', example: true })
    public readonly isActive: boolean;

    @ApiProperty({ description: 'Supabase user ID', example: 'supabase-uuid' })
    public readonly supabaseUserId: string;

    public constructor(entity: User) {
        this.id = entity.id;
        this.email = entity.email;
        this.phone = entity.phone ?? undefined;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.firstName = entity.firstName ?? '';
        this.lastName = entity.lastName ?? '';
        this.avatar = entity.avatar ?? '';
        this.role = entity.role;
        this.isActive = entity.isActive;
        this.supabaseUserId = entity.supabaseUserId ?? '';
    }
}

export class SessionDto {
    @ApiProperty({
        description: 'Access token',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    public readonly access_token: string;

    @ApiProperty({ description: 'Refresh token', example: 'refresh_token_string' })
    public readonly refresh_token: string;

    @ApiProperty({ description: 'Token expiration time', example: 3600 })
    public readonly expires_in: number;

    @ApiProperty({ description: 'Token expiration date', example: '2024-01-01T01:00:00.000Z' })
    public readonly expires_at: string;

    @ApiProperty({ description: 'Token type', example: 'bearer' })
    public readonly token_type: string;

    @ApiProperty({ description: 'User information', type: UserDto })
    public readonly user: UserDto;

    public constructor(entity: Session) {
        this.access_token = entity.access_token;
        this.refresh_token = entity.refresh_token;
        this.expires_in = entity.expires_in;
        this.expires_at = entity.expires_at?.toString() ?? '';
        this.token_type = entity.token_type;
    }
}

export class OAuthResponseDto {
    @ApiProperty({
        description: 'OAuth redirect URL',
        example: 'https://accounts.google.com/oauth/authorize?...',
    })
    public readonly url: string;

    @ApiProperty({ description: 'OAuth provider', example: 'google' })
    public readonly provider: Provider;

    public constructor(entity: OAuthResponse['data']) {
        this.url = entity.url ?? '';
        this.provider = entity.provider;
    }
}
