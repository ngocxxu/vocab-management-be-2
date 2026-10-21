import { registerAs } from '@nestjs/config';

const withTrailingSlash = (value: string): string => (value.endsWith('/') ? value : `${value}/`);

/**
 * Auth0 sets `iss` with a trailing slash, so the configured issuer is normalised to match it exactly.
 * Both values are optional: when unset, Auth0 tokens are rejected and only Supabase tokens are accepted.
 */
export default registerAs('auth0', () => ({
    issuer: process.env.AUTH0_ISSUER ? withTrailingSlash(process.env.AUTH0_ISSUER) : undefined,
    audience: process.env.AUTH0_AUDIENCE || undefined,
    /** Client id of the Vocab web app. The `aud` of an ID token; without it the account link refuses every ID token. */
    clientId: process.env.AUTH0_CLIENT_ID || undefined,
    /** The database connection password logins live on. The backend creates a login there when a User adds a password. */
    passwordConnection: process.env.AUTH0_PASSWORD_CONNECTION || 'Username-Password-Authentication',
    /** Machine-to-machine client for the Management API (deleting Auth0 users). Optional: without it Auth0 cleanup is skipped and reported. */
    m2mClientId: process.env.AUTH0_M2M_CLIENT_ID || undefined,
    m2mClientSecret: process.env.AUTH0_M2M_CLIENT_SECRET || undefined,
    /** Prefix of the custom claims the Auth0 post-login Action adds (Auth0 only allows namespaced custom claims). */
    claimNamespace: process.env.AUTH0_CLAIM_NAMESPACE ? withTrailingSlash(process.env.AUTH0_CLAIM_NAMESPACE) : undefined,
}));
