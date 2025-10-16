import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Post,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Request } from 'express';

import { CookieUtil, LoggerService } from '../../common';
import { Public } from '../../common/decorator';
import { UserDto } from '../../user/model';
import {
    OAuthPipe,
    RefreshTokenPipe,
    ResendConfirmationPipe,
    ResetPasswordPipe,
    SignInPipe,
    SignUpPipe,
    VerifyOtpPipe,
} from '../flow';
import {
    OAuthInput,
    OAuthResponseDto,
    RefreshTokenInput,
    ResendConfirmationInput,
    ResetPasswordInput,
    SessionDto,
    SignInInput,
    SignUpInput,
    VerifyOtpInput,
} from '../model';
import { AuthService } from '../service';

@Controller('auth')
@ApiTags('authentication')
export class AuthController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly authService: AuthService,
    ) {}

    @Post('signup')
    @Public()
    @ApiOperation({ summary: 'Register user with email and password' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'User registered successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Registration failed',
    })
    public async signUp(@Body(SignUpPipe) input: SignUpInput): Promise<UserDto> {
        const result = await this.authService.signUp(input);
        return result;
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
    public async signIn(
        @Body(SignInPipe) input: SignInInput,
        @Res({ passthrough: true }) response: Response,
    ): Promise<SessionDto> {
        const { email, password } = input;

        const result = await this.authService.signIn(email, password);
        this.logger.info(`User signed in successfully with email: ${email}`);

        // Set both access and refresh token cookies
        CookieUtil.setAuthCookies(response, result.accessToken, result.refreshToken);

        return result.session;
    }

    @Post('oauth')
    @Public()
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
        const { provider } = input;

        const result = await this.authService.signInWithOAuth(provider);
        this.logger.info(`OAuth sign in initiated successfully with provider: ${provider}`);

        return result;
    }

    @Get('verify')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Verify and get user information from access token cookie' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Token verified successfully',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Invalid or missing access token',
    })
    public async verifyToken(@Req() request: Request): Promise<UserDto> {
        // Extract access token from cookies using the same approach as AuthGuard
        const accessToken = this.extractTokenFromCookies(request.headers.cookie);

        if (!accessToken) {
            throw new UnauthorizedException('Access token not found in cookies');
        }

        const result = await this.authService.verifyToken(accessToken);

        this.logger.info(`Token verified successfully for user: ${result.email}`);

        return result;
    }

    @Post('refresh')
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
    public async refreshSession(
        @Body(RefreshTokenPipe) input: RefreshTokenInput,
        @Res({ passthrough: true }) response: Response,
    ): Promise<SessionDto> {
        // Try to get refresh token from request body first, then from cookies
        const refreshToken = input.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found');
        }

        const result = await this.authService.refreshSession(refreshToken);

        // Set new secure HTTP-only cookies using the utility
        CookieUtil.setAuthCookies(response, result.accessToken, result.refreshToken);

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
    public async signOut(@Res({ passthrough: true }) response: Response) {
        await this.authService.signOut();

        // Clear authentication cookies
        CookieUtil.clearAuthCookie(response);

        this.logger.info('User signed out successfully');
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

    // Add helper method to get cookie name
    private getAccessTokenCookieName(): string {
        return CookieUtil.getAccessTokenCookieName();
    }

    // Add helper method to extract token from cookies (same as AuthGuard)
    private extractTokenFromCookies(cookieHeader: string | undefined): string | null {
        if (!cookieHeader) {
            return null;
        }

        const cookies = this.parseCookies(cookieHeader);
        return cookies[this.getAccessTokenCookieName()] || null;
    }

    private parseCookies(cookieHeader: string): Record<string, string> {
        return Object.fromEntries(
            cookieHeader.split(';').map((cookie) => {
                const [key, ...v] = cookie.trim().split('=');
                return [key, decodeURIComponent(v.join('='))];
            }),
        );
    }
}
