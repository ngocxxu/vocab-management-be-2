export interface AuthUser {
    /** Internal `users.id` once resolved; the provider's own user id before that. */
    id: string;
    email: string | null;
    roles: string[];
    provider: 'auth0' | 'supabase';
    /** Token issuer (`iss`). Set for Auth0 tokens. */
    issuer?: string;
    /** Token subject (`sub`). Set for Auth0 tokens; never used as the internal user id. */
    subject?: string;
    /** True only when the token's namespaced `email_verified` claim is exactly `true`. */
    emailVerified?: boolean;
    /** Namespaced profile claims, used to fill a new User on Provisioning. */
    profile?: { firstName?: string; lastName?: string; avatar?: string };
    /** OAuth client the token was issued to (`azp`), or null for tokens without one. */
    clientId?: string | null;
    /** OAuth scopes granted to the token (the space-separated `scope` claim). Undefined when the token has no `scope` claim. */
    scopes?: string[];
}

/** The claims the account link reads from a verified Auth0 ID token. Standard OIDC claims, not the namespaced access-token ones. */
export interface Auth0IdToken {
    issuer: string;
    subject: string;
    /** The nonce the FE sent to `/authorize`, copied by Auth0 into the ID token. */
    nonce?: string;
    /** When the user really signed in (`auth_time`, seconds since the epoch). Present when `prompt=login` or `max_age` was sent. */
    authTime?: number;
    email: string | null;
    emailVerified: boolean;
}
