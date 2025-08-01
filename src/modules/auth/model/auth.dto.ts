// eslint-disable-next-line max-classes-per-file
import { ApiProperty } from '@nestjs/swagger';
import { OAuthResponse, Provider, Session } from '@supabase/supabase-js';
import { UserDto } from '../../user/model';

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

    @ApiProperty({
        description: 'User metadata',
        type: UserDto,
    })
    public readonly user: UserDto;

    public constructor(entity: Session, entityUser: UserDto) {
        this.expires_in = entity.expires_in;
        this.expires_at = entity.expires_at?.toString() ?? '';
        this.token_type = entity.token_type;
        this.user = entityUser;
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
