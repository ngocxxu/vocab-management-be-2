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
    /** When the token was issued (`iat`, seconds since the epoch). Set for Auth0 tokens that carry it. */
    issuedAt?: number;
}
