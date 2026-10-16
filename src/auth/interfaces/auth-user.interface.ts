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
    /** OAuth client the token was issued to (`azp`), or null for tokens without one. */
    clientId?: string | null;
}
