import { LoggerService } from '@/shared';
import { CurrentUser, ExcludeFromSwaggerIf, Public } from '@/shared/decorators';
import { BadRequestException, Body, Controller, Get, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';

import { UserDto } from '../../user/dto';
import {
    OAuthInput,
    OAuthResponseDto,
    OAuthSyncInput,
    RefreshTokenInput,
    ResendConfirmationInput,
    ResetPasswordInput,
    SessionDto,
    SignInInput,
    SignUpInput,
    VerifyOtpInput,
} from '../dto';
import { OAuthPipe, OAuthSyncPipe, RefreshTokenPipe, ResendConfirmationPipe, ResetPasswordPipe, SignInPipe, SignUpPipe, VerifyOtpPipe } from '../pipes';
import { AuthService } from '../services';

const isProduction = (process.env.NODE_ENV ?? '') === 'production';

@Controller('auth')
@ApiTags('authentication')
export class AuthController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly authService: AuthService,
    ) {}

    @Post('signup')
    @Public()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    @ExcludeFromSwaggerIf(isProduction)
    @ApiOperation({ summary: 'Register user with email and password' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'User registered successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Registration failed',
    })
    public async signUp(@Body(SignUpPipe) input: SignUpInput): Promise<SessionDto> {
        const result = await this.authService.signUp(input);
        this.logger.info(`User signed up successfully with email: ${input.email}`);

        return result.session;
    }

    @Post('signin')
    @Public()
    @ApiOperation({ summary: 'Sign in user with email and password' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'User signed in successfully',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Authentication failed',
    })
    public async signIn(@Body(SignInPipe) input: SignInInput): Promise<SessionDto> {
        const { email, password } = input;

        const result = await this.authService.signIn(email, password);
        this.logger.info(`User signed in successfully with email: ${email}`);

        return result.session;
    }

    @Post('oauth')
    @Public()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    @ExcludeFromSwaggerIf(isProduction)
    @ApiOperation({ summary: 'Sign in with OAuth provider' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'OAuth sign in initiated successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'OAuth authentication failed',
    })
    public async signInWithOAuth(@Body(OAuthPipe) input: OAuthInput): Promise<OAuthResponseDto> {
        const { provider, redirectTo } = input;

        if (redirectTo) {
            const allowlist = (process.env.API_CORS_ORIGINS ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);

            if (!allowlist.includes(redirectTo)) {
                throw new BadRequestException('Invalid redirectTo');
            }
        }

        const result = await this.authService.signInWithOAuth(provider, redirectTo);
        this.logger.info(`OAuth sign in initiated successfully with provider: ${provider}`);

        return result;
    }

    @Post('oauth/sync')
    @Public()
    @ApiOperation({ summary: 'Sync OAuth user from Supabase to local DB' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'OAuth user synced successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'OAuth user sync failed',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Invalid access token',
    })
    public async syncOAuthUser(@Body(OAuthSyncPipe) input: OAuthSyncInput): Promise<SessionDto> {
        const { accessToken, refreshToken } = input;

        const result = await this.authService.syncOAuthUser(accessToken, refreshToken);
        this.logger.info('OAuth user synced successfully');

        return result.session;
    }

    @Get('verify')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Verify session and return current user (requires Authorization: Bearer)' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Token verified successfully',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Invalid or missing access token',
    })
    public verifyToken(@CurrentUser() user: User): UserDto {
        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        this.logger.info(`Token verified successfully for user: ${user.email}`);

        return new UserDto(user);
    }

    @Post('refresh')
    @Public()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Refresh user session' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Session refreshed successfully',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Session refresh failed',
    })
    public async refreshSession(@Body(RefreshTokenPipe) input: RefreshTokenInput): Promise<SessionDto> {
        const refreshToken = input.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found');
        }

        const result = await this.authService.refreshSession(refreshToken);

        this.logger.info('Session refreshed successfully');

        return result.session;
    }

    @Post('signout')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Sign out current user' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'User signed out successfully',
    })
    public async signOut(): Promise<{ message: string }> {
        const result = await this.authService.signOut();

        this.logger.info('User signed out successfully');

        return result;
    }

    @Post('reset-password')
    @Public()
    @ApiOperation({ summary: 'Reset user password' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Password reset email sent successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Password reset failed',
    })
    public async resetPassword(@Body(ResetPasswordPipe) input: ResetPasswordInput) {
        const { email } = input;

        await this.authService.resetPassword(email);

        this.logger.info(`Password reset email sent to: ${email}`);
    }

    @Post('verify-otp')
    @Public()
    @ApiOperation({ summary: 'Verify OTP token' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'OTP verified successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'OTP verification failed',
    })
    public async verifyOtp(@Body(VerifyOtpPipe) input: VerifyOtpInput): Promise<SessionDto> {
        const { email, token, type } = input;

        const result = await this.authService.verifyOtp(email, token, type);
        this.logger.info(`OTP verified successfully for email: ${email}`);

        return result;
    }

    @Post('resend-confirmation')
    @Public()
    @ApiOperation({ summary: 'Resend email confirmation' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Confirmation email sent successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Failed to send confirmation email',
    })
    public async resendConfirmation(@Body(ResendConfirmationPipe) input: ResendConfirmationInput) {
        const { email } = input;

        await this.authService.resendConfirmation(email);

        this.logger.info(`Confirmation email resent to: ${email}`);
    }
}
