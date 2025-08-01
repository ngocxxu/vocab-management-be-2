import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    HttpStatus,
    Post,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserResponse } from '@supabase/supabase-js';
import { FastifyReply } from 'fastify';

import { LoggerService, CookieUtil } from '../../common';
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
        const { email, password, firstName, lastName, phone, avatar, role } = input;

        const result = await this.authService.signUp(
            email,
            password,
            firstName,
            lastName,
            phone,
            avatar,
            role,
        );

        this.logger.info(`User registered successfully with email: ${email}`);
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
    public async signIn(@Body(SignInPipe) input: SignInInput, @Res({ passthrough: true }) response: FastifyReply): Promise<SessionDto> {
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
    @ApiOperation({ summary: 'Verify and get user information from access token' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Token verified successfully',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Invalid access token',
    })
    public async verifyToken(
        @Headers('authorization') authorization: string,
    ): Promise<UserResponse['data']> {
        if (!authorization) {
            throw new BadRequestException('Authorization header is required');
        }

        const token = authorization.replace('Bearer ', '');
        const result = await this.authService.verifyToken(token);

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
        @Res({ passthrough: true }) response: FastifyReply,
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
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Sign out failed',
    })
    public async signOut(@Res({ passthrough: true }) response: FastifyReply) {
        const result = await this.authService.signOut();

        // Clear authentication cookies using the utility
        CookieUtil.clearAuthCookie(response);

        this.logger.info('User signed out successfully');

        return result;
    }

    @Post('reset-password')
    @Public()
    @ApiOperation({ summary: 'Send password reset email' })
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

        const result = await this.authService.resetPassword(email);
        this.logger.info(`Password reset email sent successfully to: ${email}`);

        return result;
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
    @ApiOperation({ summary: 'Resend confirmation email' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Confirmation email resent successfully',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Resend confirmation failed',
    })
    public async resendConfirmation(@Body(ResendConfirmationPipe) input: ResendConfirmationInput) {
        const { email } = input;

        const result = await this.authService.resendConfirmation(email);
        this.logger.info(`Confirmation email resent successfully to: ${email}`);

        return result;
    }
}
