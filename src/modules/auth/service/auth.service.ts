import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AuthError, createClient, SupabaseClient, UserResponse } from '@supabase/supabase-js';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { UserDto } from '../../user/model';
import { OAuthResponseDto, SessionDto } from '../model';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly supabase: SupabaseClient;

    // Custom error mapping for Auth operations
    private readonly authErrorMapping = {
        invalid_credentials: 'Invalid email or password',
        email_not_confirmed: 'Email not confirmed. Please check your email for confirmation link',
        signup_disabled: 'Sign up is currently disabled',
        email_address_invalid: 'Invalid email address format',
        password_too_short: 'Password must be at least 6 characters long',
        token_expired: 'Token has expired',
        invalid_token: 'Invalid or malformed token',
    };

    public constructor(private readonly prismaService: PrismaService) {
        this.supabase = createClient(
            process.env.SUPABASE_URL ?? '',
            process.env.SUPABASE_KEY ?? '',
        );
    }

    /**
     * Register user with email and password
     */
    public async signUp(
        email: string,
        password: string,
        firstName?: string,
        lastName?: string,
        phone?: string,
        avatar?: string,
        role?: UserRole, // Use enum type for role
    ): Promise<UserDto> {
        try {
            // 1. Create user in Supabase
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        role: role ?? UserRole.STAFF,
                    },
                },
            });

            if (error) {
                this.handleAuthError(error, 'signUp');
            }
            if (!data.user) {
                throw new Error('User data is missing from Supabase response');
            }

            // 2. Create user in local DB
            const supabaseUser = data.user;
            const user = await this.prismaService.user.create({
                data: {
                    email: email ?? supabaseUser.email,
                    supabaseUserId: supabaseUser.id,
                    firstName: firstName ?? '',
                    lastName: lastName ?? '',
                    phone: phone ?? supabaseUser.phone,
                    avatar,
                    role: role ?? UserRole.STAFF, // Use enum value
                    isActive: true,
                },
            });

            if (!user) {
                await this.supabase.auth.admin.deleteUser(supabaseUser.id);
                throw new Error('User data is missing from Supabase response');
            }

            // 3. Update User ID in Supabase
            await this.supabase.auth.admin.updateUserById(supabaseUser.id, {
                user_metadata: {
                    user_id: user.id,
                },
            });

            return new UserDto({
                ...user,
            });
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('SignUp failed:', error);
            throw new BadRequestException('Registration failed');
        }
    }

    /**
     * Sign in user with email and password
     */
    public async signIn(
        email: string,
        password: string,
    ): Promise<{ session: SessionDto; refreshToken: string }> {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                this.handleAuthError(error, 'signIn');
            }
            if (!data.session) {
                throw new UnauthorizedException('No session data returned');
            }

            return {
                session: new SessionDto(data.session),
                refreshToken: data.session.refresh_token,
            };
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('SignIn failed:', error);
            throw new UnauthorizedException('Authentication failed');
        }
    }

    /**
     * Sign in with OAuth provider
     */
    public async signInWithOAuth(
        provider: 'google' | 'github' | 'facebook' | 'apple',
    ): Promise<OAuthResponseDto> {
        try {
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${process.env.APP_URL}/auth/callback`,
                },
            });

            if (error) {
                this.handleAuthError(error, 'signInWithOAuth');
            }

            return new OAuthResponseDto(data);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('OAuth SignIn failed:', error);
            throw new BadRequestException('OAuth authentication failed');
        }
    }

    /**
     * Verify and get user information from access token
     */
    public async verifyToken(accessToken: string): Promise<UserResponse['data']> {
        try {
            const { data, error } = await this.supabase.auth.getUser(accessToken);

            if (error) {
                this.handleAuthError(error, 'verifyToken');
            }

            return data;
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('VerifyToken failed:', error);
            throw new UnauthorizedException('Invalid access token');
        }
    }

    /**
     * Refresh user session
     */
    public async refreshSession(refreshToken: string): Promise<SessionDto> {
        try {
            const { data, error } = await this.supabase.auth.refreshSession({
                refresh_token: refreshToken,
            });

            if (error) {
                this.handleAuthError(error, 'refreshSession');
            }
            if (!data.session) {
                throw new UnauthorizedException('No session data returned');
            }

            return new SessionDto(data.session);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('RefreshSession failed:', error);
            throw new UnauthorizedException('Session refresh failed');
        }
    }
    /**
     * Sign out current user
     */
    public async signOut() {
        try {
            const { error } = await this.supabase.auth.signOut();

            if (error) {
                this.handleAuthError(error, 'signOut');
            }

            return { message: 'Signed out successfully' };
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('SignOut failed:', error);
            throw new BadRequestException('Sign out failed');
        }
    }

    /**
     * Send password reset email
     */
    public async resetPassword(email: string) {
        try {
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.APP_URL}/auth/reset-password`,
            });

            if (error) {
                this.handleAuthError(error, 'resetPassword');
            }

            return { message: 'Password reset email sent' };
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('ResetPassword failed:', error);
            throw new BadRequestException('Password reset failed');
        }
    }

    /**
     * Verify OTP token
     */
    public async verifyOtp(
        email: string,
        token: string,
        type: 'signup' | 'recovery' | 'email_change',
    ): Promise<SessionDto> {
        try {
            const { data, error } = await this.supabase.auth.verifyOtp({
                email,
                token,
                type,
            });

            if (error) {
                this.handleAuthError(error, 'verifyOtp');
            }
            if (!data.session) {
                throw new UnauthorizedException('No session data returned');
            }

            return new SessionDto(data.session);
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('VerifyOtp failed:', error);
            throw new BadRequestException('OTP verification failed');
        }
    }

    /**
     * Resend confirmation email
     */
    public async resendConfirmation(email: string) {
        try {
            const { error } = await this.supabase.auth.resend({
                type: 'signup',
                email,
            });

            if (error) {
                this.handleAuthError(error, 'resendConfirmation');
            }

            return { message: 'Password reset email sent' };
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(error);
            }
            this.logger.error('ResendConfirmation failed:', error);
            throw new BadRequestException('Resend confirmation failed');
        }
    }

    /**
     * Handle authentication errors
     */
    private handleAuthError(error: unknown, operation: string): void {
        if (error instanceof AuthError) {
            const errorMessage =
                this.authErrorMapping[error.code as keyof typeof this.authErrorMapping] ??
                error.code;
            this.logger.error(`${operation} error:`, error);

            if (
                error.code?.includes('invalid_credentials') ||
                error.code?.includes('user_not_found') ||
                error.code?.includes('token_expired') ||
                error.code?.includes('invalid_token')
            ) {
                throw new UnauthorizedException(errorMessage);
            }
            throw new BadRequestException(errorMessage);
        }

        // Handle other types of errors
        if (error instanceof Error) {
            throw new Error(`Database operation failed: ${error.message}`);
        }

        throw new Error('An unexpected error occurred');
    }
}
