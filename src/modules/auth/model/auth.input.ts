// eslint-disable-next-line max-classes-per-file
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class SignUpInput {
    @ApiProperty({ description: 'User email address', example: 'user@gmail.com' })
    public readonly email: string;

    @ApiProperty({ description: 'User password', example: 'password123', minLength: 6 })
    public readonly password: string;

    @ApiPropertyOptional({ description: 'User first name', example: 'John', maxLength: 50 })
    public readonly firstName?: string;

    @ApiPropertyOptional({ description: 'User last name', example: 'Doe', maxLength: 50 })
    public readonly lastName?: string;

    @ApiPropertyOptional({ description: 'User phone number', example: '+1234567890' })
    public readonly phone?: string;

    @ApiPropertyOptional({
        description: 'User avatar URL',
        example: 'https://i.pravatar.cc/300?img=test',
    })
    public readonly avatar?: string;

    @ApiPropertyOptional({
        description: 'User role',
        enum: ['ADMIN', 'MEMBER', 'GUEST'],
        example: 'GUEST',
        default: 'GUEST',
    })
    public readonly role?: UserRole;
}

export class SignInInput {
    @ApiProperty({ description: 'User email address', example: 'user@gmail.com' })
    public readonly email: string;

    @ApiProperty({ description: 'User password', example: 'password123' })
    public readonly password: string;
}

export class OAuthInput {
    @ApiProperty({
        description: 'OAuth provider',
        enum: ['google', 'github', 'facebook', 'apple'],
        example: 'google',
    })
    public readonly provider: 'google' | 'github' | 'facebook' | 'apple';
}

export class RefreshTokenInput {
    @ApiProperty({ description: 'Refresh token', example: 'refresh_token_string' })
    public readonly refreshToken: string;
}

export class ResetPasswordInput {
    @ApiProperty({ description: 'User email address', example: 'user@gmail.com' })
    public readonly email: string;
}

export class VerifyOtpInput {
    @ApiProperty({ description: 'User email address', example: 'user@gmail.com' })
    public readonly email: string;

    @ApiProperty({ description: 'OTP token', example: '123456' })
    public readonly token: string;

    @ApiProperty({
        description: 'OTP type',
        enum: ['signup', 'recovery', 'email_change'],
        example: 'signup',
    })
    public readonly type: 'signup' | 'recovery' | 'email_change';
}

export class ResendConfirmationInput {
    @ApiProperty({ description: 'User email address', example: 'user@gmail.com' })
    public readonly email: string;
}

export class OAuthSyncInput {
    @ApiProperty({
        description: 'Supabase access token from OAuth session',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    public readonly accessToken: string;

    @ApiProperty({
        description: 'Supabase refresh token from OAuth session',
        example: 'refresh_token_string',
    })
    public readonly refreshToken: string;
}
