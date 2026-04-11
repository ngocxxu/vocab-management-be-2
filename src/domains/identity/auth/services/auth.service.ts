import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthError } from '@supabase/supabase-js';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { LoggerService } from '@/shared/services/logger.service';
import { jwtDecode } from '@/shared/utils/jwt.util';
import { UserDto } from '../../user/dto';
import { UserRepository } from '../../user/repositories';
import {
    AuthBadRequestException,
    AuthSupabaseMessageException,
    AuthUnauthorizedException,
    InvalidCredentialsException,
} from '../exceptions';
import { OAuthResponseDto, SessionDto, SignUpInput } from '../dto';
import { SignInResponse } from '../utils';

@Injectable()
export class AuthService {
    private readonly authErrorMapping = {
        'Invalid login credentials': 'Invalid email or password',
        'Email not confirmed': 'Please confirm your email before signing in',
        'User not found': 'User not found',
        'Invalid refresh token': 'Invalid refresh token',
    };

    public constructor(
        private readonly userRepository: UserRepository,
        private readonly supabaseAuth: SupabaseAuthProvider,
        private readonly logger: LoggerService,
    ) {}

    private get auth() {
        return this.supabaseAuth.getAnonClient().auth;
    }

    private get authAdmin() {
        return this.supabaseAuth.getServiceRoleClient().auth.admin;
    }

    public async signUp(input: SignUpInput): Promise<SignInResponse> {
        const { email, password, firstName, lastName, phone, avatar, role } = input;

        const { data, error } = await this.auth.signUp({
            email,
            password,
            options: {
                data: {
                    role: role ?? UserRole.GUEST,
                },
            },
        });

        if (error) {
            this.raiseAuthError(error, 'signUp');
        }
        if (!data.user) {
            throw new AuthUnauthorizedException('supabase_user_missing');
        }

        const supabaseUser = data.user;
        const user = await this.userRepository.create({
            email: email ?? supabaseUser.email,
            supabaseUserId: supabaseUser.id,
            firstName: firstName && firstName.trim() !== '' ? firstName : '',
            lastName: lastName && lastName.trim() !== '' ? lastName : '',
            phone: phone && phone.trim() !== '' ? phone : supabaseUser.phone || null,
            avatar: avatar && avatar.trim() !== '' ? avatar : null,
            role: role ?? UserRole.GUEST,
            isActive: true,
        });

        if (!user) {
            await this.authAdmin.deleteUser(supabaseUser.id);
            throw new AuthBadRequestException('registration_failed');
        }

        let session = data.session;
        if (!session) {
            const signInResult = await this.auth.signInWithPassword({
                email,
                password,
            });

            if (signInResult.error) {
                this.raiseAuthError(signInResult.error, 'signUp');
            }
            if (!signInResult.data.session) {
                throw new AuthUnauthorizedException('no_session_after_signup');
            }
            session = signInResult.data.session;
        }

        return {
            session: new SessionDto(session, new UserDto(user)),
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
        };
    }

    public async signIn(email: string, password: string): Promise<SignInResponse> {
        const { data, error } = await this.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            this.raiseAuthError(error, 'signIn');
        }
        if (!data.session) {
            throw new AuthUnauthorizedException('no_session');
        }

        const decodedToken = jwtDecode(data.session.access_token);

        const user = decodedToken?.sub
            ? await this.userRepository.findBySupabaseUserId(decodedToken.sub)
            : null;

        if (!user) {
            throw new AuthUnauthorizedException('user_not_found');
        }

        return {
            session: new SessionDto(data.session, new UserDto(user)),
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
        };
    }

    public async signInWithOAuth(
        provider: 'google' | 'github' | 'facebook' | 'apple',
        redirectTo?: string,
    ): Promise<OAuthResponseDto> {
        const { data, error } = await this.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: redirectTo ?? '',
            },
        });

        if (error) {
            this.raiseAuthError(error, 'signInWithOAuth');
        }

        return new OAuthResponseDto(data);
    }

    public async verifyToken(accessToken: string): Promise<UserDto> {
        const { data, error } = await this.auth.getUser(accessToken);

        if (error) {
            this.raiseAuthError(error, 'verifyToken');
        }

        const user = data.user?.id
            ? await this.userRepository.findBySupabaseUserId(data.user.id)
            : null;

        if (!user) {
            throw new AuthUnauthorizedException('user_not_found');
        }

        return new UserDto(user);
    }

    public async refreshSession(refreshToken: string): Promise<SignInResponse> {
        const { data, error } = await this.auth.refreshSession({
            refresh_token: refreshToken,
        });

        if (error) {
            this.raiseAuthError(error, 'refreshSession');
        }
        if (!data.session) {
            throw new AuthUnauthorizedException('no_session');
        }

        const decodedToken = jwtDecode(data.session.access_token);

        const user = decodedToken?.sub
            ? await this.userRepository.findBySupabaseUserId(decodedToken.sub)
            : null;

        if (!user) {
            throw new AuthUnauthorizedException('user_not_found');
        }

        return {
            session: new SessionDto(data.session, new UserDto(user)),
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
        };
    }

    public async signOut() {
        const { error } = await this.auth.signOut();

        if (error) {
            this.raiseAuthError(error, 'signOut');
        }

        return { message: 'User signed out successfully' };
    }

    public async resetPassword(email: string) {
        const { error } = await this.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.APP_URL}/auth/reset-password`,
        });

        if (error) {
            this.raiseAuthError(error, 'resetPassword');
        }

        return { message: 'Password reset email sent successfully' };
    }

    public async verifyOtp(
        email: string,
        token: string,
        type: 'signup' | 'recovery' | 'email_change',
    ): Promise<SessionDto> {
        const { data, error } = await this.auth.verifyOtp({
            email,
            token,
            type,
        });

        if (error) {
            this.raiseAuthError(error, 'verifyOtp');
        }
        if (!data.session) {
            throw new AuthUnauthorizedException('no_session');
        }

        const decodedToken = jwtDecode(data.session.access_token);

        const user = decodedToken?.sub
            ? await this.userRepository.findBySupabaseUserId(decodedToken.sub)
            : null;

        if (!user) {
            throw new AuthUnauthorizedException('user_not_found');
        }

        return new SessionDto(data.session, new UserDto(user));
    }

    public async resendConfirmation(email: string) {
        const { error } = await this.auth.resend({
            type: 'signup',
            email,
        });

        if (error) {
            this.raiseAuthError(error, 'resendConfirmation');
        }

        return { message: 'Confirmation email resent successfully' };
    }

    public async syncOAuthUser(accessToken: string, refreshToken: string): Promise<SignInResponse> {
        const userClient = this.supabaseAuth.createClientWithAccessToken(accessToken);

        const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);

        if (userError) {
            this.raiseAuthError(userError, 'syncOAuthUser');
        }
        if (!userData.user) {
            throw new AuthUnauthorizedException('supabase_user_missing');
        }

        const supabaseUser = userData.user;
        const extractedUserData = this.extractUserDataFromSupabase(supabaseUser);

        let user = await this.userRepository.findBySupabaseUserId(supabaseUser.id);

        if (!user) {
            user = await this.userRepository.create({
                email: extractedUserData.email,
                supabaseUserId: supabaseUser.id,
                firstName: extractedUserData.firstName,
                lastName: extractedUserData.lastName,
                phone: extractedUserData.phone,
                avatar: extractedUserData.avatar,
                role: extractedUserData.role,
                isActive: true,
            });
        } else {
            const needsUpdate =
                user.firstName !== extractedUserData.firstName ||
                user.lastName !== extractedUserData.lastName ||
                user.avatar !== extractedUserData.avatar ||
                (extractedUserData.phone && user.phone !== extractedUserData.phone);

            if (needsUpdate) {
                user = await this.userRepository.update(user.id, {
                    firstName: extractedUserData.firstName,
                    lastName: extractedUserData.lastName,
                    avatar: extractedUserData.avatar,
                    ...(extractedUserData.phone && { phone: extractedUserData.phone }),
                });
            }
        }

        const { data: sessionData, error: sessionError } = await userClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        if (sessionError || !sessionData.session) {
            throw new AuthUnauthorizedException('failed_get_session');
        }

        return {
            session: new SessionDto(sessionData.session, new UserDto(user)),
            accessToken: sessionData.session.access_token,
            refreshToken: sessionData.session.refresh_token,
        };
    }

    private extractUserDataFromSupabase(supabaseUser: {
        id: string;
        email?: string;
        phone?: string;
        user_metadata?: Record<string, unknown>;
        raw_user_meta_data?: Record<string, unknown>;
    }): {
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatar: string | null;
        role: UserRole;
    } {
        const metadata = supabaseUser.user_metadata || supabaseUser.raw_user_meta_data || {};
        const email = supabaseUser.email || (metadata.email as string) || '';

        let firstName = '';
        let lastName = '';
        const fullName = (metadata.full_name as string) || (metadata.name as string) || '';

        if (fullName) {
            const nameParts = fullName.trim().split(/\s+/);
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
        } else {
            firstName = (metadata.first_name as string) || (metadata.given_name as string) || '';
            lastName = (metadata.last_name as string) || (metadata.family_name as string) || '';
        }

        const avatar =
            (metadata.avatar_url as string) ||
            (metadata.picture as string) ||
            (metadata.photo_url as string) ||
            null;

        const phone = supabaseUser.phone || (metadata.phone as string) || null;

        const roleFromMetadata = metadata.role as string;
        const validRoles = Object.values(UserRole);
        const role =
            roleFromMetadata && validRoles.includes(roleFromMetadata as UserRole)
                ? (roleFromMetadata as UserRole)
                : UserRole.GUEST;

        return {
            email,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone ? phone.trim() : null,
            avatar: avatar ? avatar.trim() : null,
            role,
        };
    }

    private raiseAuthError(error: unknown, operation: string): never {
        if (error instanceof AuthError) {
            if (error.message === 'Invalid login credentials') {
                throw new InvalidCredentialsException();
            }
            const message =
                this.authErrorMapping[error.message as keyof typeof this.authErrorMapping] ||
                error.message;
            throw new AuthSupabaseMessageException(message);
        }
        this.logger.error(`Authentication ${operation} failed: ${String(error)}`);
        throw new AuthSupabaseMessageException(`Authentication ${operation} failed`);
    }
}
