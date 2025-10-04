import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AuthError, createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { PrismaService } from '../../common/provider';
import { jwtDecode } from '../../common/util/jwt.util';
import { UserDto } from '../../user/model';
import { OAuthResponseDto, SessionDto, SignUpInput } from '../model';
import { SignInResponse } from '../util';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly supabase: SupabaseClient;

    private readonly authErrorMapping = {
        'Invalid login credentials': 'Invalid email or password',
        'Email not confirmed': 'Please confirm your email before signing in',
        'User not found': 'User not found',
        'Invalid refresh token': 'Invalid refresh token',
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
    public async signUp(input: SignUpInput): Promise<UserDto> {
        try {
            const { email, password, firstName, lastName, phone, avatar, role } = input;

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
                    firstName: firstName && firstName.trim() !== '' ? firstName : '',
                    lastName: lastName && lastName.trim() !== '' ? lastName : '',
                    phone: phone && phone.trim() !== '' ? phone : supabaseUser.phone || null,
                    avatar: avatar && avatar.trim() !== '' ? avatar : null,
                    role: role ?? UserRole.STAFF,
                    isActive: true,
                },
            });

            if (!user) {
                await this.supabase.auth.admin.deleteUser(supabaseUser.id);
                throw new Error('User data is missing from Supabase response');
            }

            return new UserDto(user);
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
    public async signIn(email: string, password: string): Promise<SignInResponse> {
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

            const decodedToken = jwtDecode(data.session.access_token);

            const user = await this.prismaService.user.findUnique({
                where: {
                    supabaseUserId: decodedToken?.sub,
                },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return {
                session: new SessionDto(data.session, new UserDto(user)),
                accessToken: data.session.access_token,
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
    public async verifyToken(accessToken: string): Promise<UserDto> {
        try {
            const { data, error } = await this.supabase.auth.getUser(accessToken);

            if (error) {
                this.handleAuthError(error, 'verifyToken');
            }

            const user = await this.prismaService.user.findUnique({
                where: {
                    supabaseUserId: data.user?.id,
                },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return new UserDto(user);
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
    public async refreshSession(refreshToken: string): Promise<SignInResponse> {
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

            const decodedToken = jwtDecode(data.session.access_token);

            const user = await this.prismaService.user.findUnique({
                where: {
                    supabaseUserId: decodedToken?.sub,
                },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return {
                session: new SessionDto(data.session, new UserDto(user)),
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
            };
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

            return { message: 'User signed out successfully' };
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

            return { message: 'Password reset email sent successfully' };
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

            const decodedToken = jwtDecode(data.session.access_token);

            const user = await this.prismaService.user.findUnique({
                where: {
                    supabaseUserId: decodedToken?.sub,
                },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return new SessionDto(data.session, new UserDto(user));
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

            return { message: 'Confirmation email resent successfully' };
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
            const message =
                this.authErrorMapping[error.message as keyof typeof this.authErrorMapping] ||
                error.message;
            throw new UnauthorizedException(message);
        }
        throw new UnauthorizedException(`Authentication ${operation} failed`);
    }
}
