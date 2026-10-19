import { AllowUnprovisioned } from '@/auth/decorators';
import { CurrentUser as CurrentAuthUser } from '@/auth/decorators/current-user.decorator';
import type { AuthUser } from '@/auth/interfaces/auth-user.interface';
import { LoggerService, RolesGuard } from '@/shared';
import { CurrentUser, ExcludeFromSwaggerIf, Public, Roles } from '@/shared/decorators';
import { jwtDecode } from '@/shared/utils/jwt.util';
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';

import { UserDto } from '../../user/dto';
import {
    ChangePasswordInput,
    LinkIdentityInput,
    OAuthInput,
    OAuthResponseDto,
    OAuthSyncInput,
    RefreshTokenInput,
    ResendConfirmationInput,
    ResetPasswordInput,
    SessionDto,
    SignInInput,
    SignInMethodsDto,
    SignUpInput,
    SignUpResponseDto,
    VerifyOtpInput,
} from '../dto';
import { AuthUnauthorizedException } from '../exceptions';
import { ChangePasswordPipe, OAuthPipe, OAuthSyncPipe, RefreshTokenPipe, ResendConfirmationPipe, ResetPasswordPipe, SignInPipe, SignUpPipe, VerifyOtpPipe } from '../pipes';
import { AccountLinkService, AuthService } from '../services';

const isProduction = (process.env.NODE_ENV ?? '') === 'production';

@Controller('auth')
@ApiTags('authentication')
export class AuthController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly authService: AuthService,
        private readonly accountLinkService: AccountLinkService,
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
    public async signUp(@Body(SignUpPipe) input: SignUpInput): Promise<SignUpResponseDto> {
        const result = await this.authService.signUp(input);
        this.logger.info(`User signed up successfully with email: ${input.email}`);

        return new SignUpResponseDto(result.session, result.message);
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

    // No RolesGuard here on purpose: a user being provisioned has no database role yet. The global guard still requires a valid Auth0 token.
    @Post('sync')
    @HttpCode(HttpStatus.OK)
    @AllowUnprovisioned()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Provision the User for the signed-in Auth0 identity (idempotent); call once after the Auth0 callback' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto, description: 'The User for this identity, created on the first call' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid or missing access token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'email_not_verified' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'account_link_required: the email belongs to another User; an admin must link the account' })
    public async syncAuth0User(@CurrentAuthUser() authUser: AuthUser): Promise<UserDto> {
        const user = await this.authService.syncAuth0User(authUser);
        return new UserDto(user);
    }

    @Get('identities')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiBearerAuth()
    @ApiOperation({ summary: "List the signed-in User's sign-in methods as provider labels (never the provider user id)" })
    @ApiResponse({ status: HttpStatus.OK, type: SignInMethodsDto })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid or missing access token' })
    public async listSignInMethods(@CurrentUser() user: User): Promise<SignInMethodsDto> {
        return new SignInMethodsDto(await this.accountLinkService.listSignInMethods(user.id));
    }

    @Post('identities/link')
    @HttpCode(HttpStatus.OK)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    // Tight on purpose: a link is a security-sensitive change, and a stolen proof should not be retried at speed.
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Connect another sign-in method to the signed-in User (idempotent). The session is the User; the body token proves control of the new method.' })
    @ApiResponse({ status: HttpStatus.OK, type: SignInMethodsDto, description: 'The sign-in methods after linking' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid or missing session token, or an invalid link token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'email_not_verified or link_proof_stale (the link token is older than 5 minutes)' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'identity_already_linked: that sign-in method belongs to another User' })
    @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Too many link attempts' })
    public async linkIdentity(@CurrentUser() user: User, @Body() input: LinkIdentityInput): Promise<SignInMethodsDto> {
        await this.accountLinkService.linkAuth0Identity(user, input.linkToken);
        return new SignInMethodsDto(await this.accountLinkService.listSignInMethods(user.id));
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
    public verifyToken(@CurrentUser() user: User, @Req() request: Request): UserDto {
        if (!user) {
            throw new AuthUnauthorizedException('user_not_found');
        }

        this.logger.info(`Token verified successfully for user: ${user.email}`);

        const accessToken = request.headers.authorization?.split(' ')[1] ?? '';
        return new UserDto(user, jwtDecode(accessToken)?.app_metadata?.providers);
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
            throw new AuthUnauthorizedException('refresh_token_missing');
        }

        const result = await this.authService.refreshSession(refreshToken);

        this.logger.info('Session refreshed successfully');

        return result.session;
    }

    @Post('change-password')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Change (or set) the current user password' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Password updated successfully',
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Current password is incorrect',
    })
    public async changePassword(@CurrentUser() user: User, @Body(ChangePasswordPipe) input: ChangePasswordInput): Promise<{ message: string; session: SessionDto }> {
        const result = await this.authService.changePassword(user, input.currentPassword, input.newPassword);

        this.logger.info(`Password updated for user: ${user.email}`);

        return result;
    }

    @Post('signout')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Sign out current user' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'User signed out successfully',
    })
    public async signOut(@Req() request: Request): Promise<{ message: string }> {
        const accessToken = request.headers.authorization?.split(' ')[1] ?? '';
        const result = await this.authService.signOut(accessToken);

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
