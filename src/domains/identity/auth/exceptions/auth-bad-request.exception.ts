import { BadRequestException } from '@nestjs/common';

export type AuthBadRequestCode =
    | 'registration_failed'
    | 'oauth_authentication_failed'
    | 'sign_out_failed'
    | 'password_reset_failed'
    | 'otp_verification_failed'
    | 'resend_confirmation_failed'
    | 'oauth_user_sync_failed';

const MESSAGES: Record<AuthBadRequestCode, string> = {
    registration_failed: 'Registration failed',
    oauth_authentication_failed: 'OAuth authentication failed',
    sign_out_failed: 'Sign out failed',
    password_reset_failed: 'Password reset failed',
    otp_verification_failed: 'OTP verification failed',
    resend_confirmation_failed: 'Resend confirmation failed',
    oauth_user_sync_failed: 'OAuth user sync failed',
};

export class AuthBadRequestException extends BadRequestException {
    public readonly code: AuthBadRequestCode;

    public constructor(code: AuthBadRequestCode) {
        super(MESSAGES[code]);
        this.code = code;
    }
}
