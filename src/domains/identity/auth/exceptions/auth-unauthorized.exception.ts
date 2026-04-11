import { UnauthorizedException } from '@nestjs/common';

export type AuthUnauthorizedCode =
    | 'no_session_after_signup'
    | 'no_session'
    | 'user_not_found'
    | 'invalid_access_token'
    | 'session_refresh_failed'
    | 'supabase_user_missing'
    | 'failed_get_session';

const MESSAGES: Record<AuthUnauthorizedCode, string> = {
    no_session_after_signup: 'No session data returned after signup',
    no_session: 'No session data returned',
    user_not_found: 'User not found',
    invalid_access_token: 'Invalid access token',
    session_refresh_failed: 'Session refresh failed',
    supabase_user_missing: 'User data is missing from Supabase response',
    failed_get_session: 'Failed to get session',
};

export class AuthUnauthorizedException extends UnauthorizedException {
    public readonly code: AuthUnauthorizedCode;

    public constructor(code: AuthUnauthorizedCode) {
        super(MESSAGES[code]);
        this.code = code;
    }
}
