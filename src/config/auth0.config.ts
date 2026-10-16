import { registerAs } from '@nestjs/config';

const withTrailingSlash = (value: string): string => (value.endsWith('/') ? value : `${value}/`);

/**
 * Auth0 sets `iss` with a trailing slash, so the configured issuer is normalised to match it exactly.
 * Both values are optional: when unset, Auth0 tokens are rejected and only Supabase tokens are accepted.
 */
export default registerAs('auth0', () => ({
    issuer: process.env.AUTH0_ISSUER ? withTrailingSlash(process.env.AUTH0_ISSUER) : undefined,
    audience: process.env.AUTH0_AUDIENCE || undefined,
    /** Prefix of the custom claims the Auth0 post-login Action adds (Auth0 only allows namespaced custom claims). */
    claimNamespace: process.env.AUTH0_CLAIM_NAMESPACE ? withTrailingSlash(process.env.AUTH0_CLAIM_NAMESPACE) : undefined,
}));
