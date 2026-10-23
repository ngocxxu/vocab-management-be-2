// eslint-disable-next-line max-classes-per-file
import { ApiProperty } from '@nestjs/swagger';
import { OAuthResponse, Provider, Session } from '@supabase/supabase-js';
import { UserDto } from '../../user/dto';

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
        this.access_token = entity.access_token;
        this.refresh_token = entity.refresh_token;
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

export class LinkNonceDto {
    @ApiProperty({ description: 'Single-use nonce, valid for 5 minutes. Send it to Auth0 as the `nonce` parameter of the second login.', example: 'k3J9...' })
    public readonly nonce: string;

    public constructor(nonce: string) {
        this.nonce = nonce;
    }
}

export class VerificationEmailDto {
    @ApiProperty({ description: 'Auth0 has been asked to email the login a new verification link. The link itself is never returned.', example: true })
    public readonly emailSent: boolean;

    public constructor(emailSent: boolean) {
        this.emailSent = emailSent;
    }
}

export class PasswordSetupDto {
    @ApiProperty({ description: 'Auth0 has been asked to email the User a link to set the password. The link itself is never returned.', example: true })
    public readonly emailSent: boolean;

    public constructor(emailSent: boolean) {
        this.emailSent = emailSent;
    }
}

export class SignInMethodsDto {
    @ApiProperty({ description: 'Provider labels of the sign-in methods the User has connected. Never the provider user id.', example: ['google', 'password'], type: [String] })
    public readonly methods: string[];

    @ApiProperty({
        description: 'Provider labels whose login exists but whose password is not set yet (the set-password email is still open).',
        example: ['password'],
        type: [String],
    })
    public readonly pending: string[];

    public constructor(methods: string[], pending: string[]) {
        this.methods = methods;
        this.pending = pending;
    }
}
