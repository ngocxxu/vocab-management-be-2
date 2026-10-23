import { captureSentryException } from '@/shared/utils/sentry.util';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import CircuitBreaker from 'opossum';

const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const NOT_FOUND = 404;
const CONFLICT = 409;
const TOO_MANY_REQUESTS = 429;

/**
 * Own breaker, separate from the other external services. 4xx answers are the caller's mistake or an already-deleted
 * user, not an outage, so they are filtered out and never trip the circuit. 429 is the exception: being rate limited
 * means Auth0 cannot take more calls, so it counts.
 */
const BREAKER_OPTIONS = {
    timeout: REQUEST_TIMEOUT_MS,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    volumeThreshold: 3,
    errorFilter: (error: unknown): boolean =>
        error instanceof Auth0ManagementError && error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== TOO_MANY_REQUESTS,
};

class Auth0ManagementError extends Error {
    public constructor(
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = 'Auth0ManagementError';
    }
}

interface CachedToken {
    value: string;
    expiresAt: number;
}

@Injectable()
export class Auth0ManagementService {
    private readonly logger = new Logger(Auth0ManagementService.name);
    private readonly breaker: CircuitBreaker<[() => Promise<unknown>], unknown>;
    private token?: CachedToken;
    private tokenRequest?: Promise<string>;

    public constructor(private readonly configService: ConfigService) {
        this.breaker = new CircuitBreaker(async (call: () => Promise<unknown>): Promise<unknown> => call(), BREAKER_OPTIONS);
        this.breaker.on('open', () => this.logger.warn('Auth0 Management circuit opened, failing fast until it half-opens'));
        this.breaker.on('close', () => this.logger.log('Auth0 Management circuit closed'));
    }

    /** Deletes one Auth0 user by its `user_id` (the token `sub`). A user that is already gone counts as deleted. */
    public async deleteUser(auth0UserId: string): Promise<void> {
        this.readSettings();
        await this.breaker.fire(async () => this.requestDelete(auth0UserId));
    }

    /**
     * Creates a password login on the main database connection for `email` and returns its `user_id`, or `null` when a login with
     * that email already exists there. The password is random and thrown away: the User sets a real one through the email from
     * `sendPasswordSetEmail`. The marker is in `app_metadata` on purpose: the public sign-up can set `user_metadata` but not this.
     */
    public async createPasswordUser(email: string): Promise<string | null> {
        const { issuer } = this.readSettings();
        const connection = this.readPasswordConnection();
        return this.breaker.fire(async () => {
            const response = await fetch(`${issuer}api/v2/users`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${await this.getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connection,
                    email,
                    password: `${randomBytes(32).toString('base64url')}aA1!`,
                    email_verified: false,
                    verify_email: false,
                    app_metadata: { created_by: 'vocab-backend' },
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (response.status === CONFLICT) {
                return null;
            }
            if (!response.ok) {
                throw new Auth0ManagementError(`Auth0 Management API responded ${response.status}`, response.status);
            }
            const body = (await response.json()) as { user_id?: string };
            if (!body.user_id) {
                throw new Auth0ManagementError('Auth0 Management API returned no user_id');
            }
            return body.user_id;
        }) as Promise<string | null>;
    }

    /**
     * When the User last set a password on the database connection, or `null` when they never have (the set-password email is
     * still open). A user Auth0 no longer has also reads as `null`.
     */
    public async getLastPasswordReset(auth0UserId: string): Promise<string | null> {
        const { issuer } = this.readSettings();
        return this.breaker.fire(async () => {
            const response = await fetch(`${issuer}api/v2/users/${encodeURIComponent(auth0UserId)}`, {
                headers: { Authorization: `Bearer ${await this.getToken()}` },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (response.status === NOT_FOUND) {
                return null;
            }
            if (!response.ok) {
                throw new Auth0ManagementError(`Auth0 Management API responded ${response.status}`, response.status);
            }
            const body = (await response.json()) as { last_password_reset?: string };
            return body.last_password_reset ?? null;
        }) as Promise<string | null>;
    }

    /** Asks Auth0 to email a database user the verification link. Auth0 sends it, so the link never passes through this server. */
    public async sendVerificationEmail(subject: string): Promise<void> {
        const { issuer } = this.readSettings();
        const clientId = this.readClientId();
        await this.breaker.fire(async () => {
            const response = await fetch(`${issuer}api/v2/jobs/verification-email`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${await this.getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: subject, client_id: clientId }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Auth0ManagementError(`Auth0 Management API responded ${response.status}`, response.status);
            }
        });
    }

    /** Asks Auth0 to email the User a password-set link. Auth0 sends it, so the link never passes through this server or the browser. */
    public async sendPasswordSetEmail(email: string): Promise<void> {
        const { issuer } = this.readSettings();
        const clientId = this.readClientId();
        const connection = this.readPasswordConnection();
        await this.breaker.fire(async () => {
            const response = await fetch(`${issuer}dbconnections/change_password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, email, connection }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Auth0ManagementError(`Auth0 password-change request responded ${response.status}`, response.status);
            }
        });
    }

    /**
     * Best-effort cleanup after a User was deleted: removes the Auth0 account behind each Identity that belongs to this
     * tenant. Never throws, so an Auth0 outage cannot block a delete; each failure is logged and captured with the
     * user id and subject so the leftover account can be removed by hand.
     */
    public async deleteIdentities(userId: string, identities: { issuer: string; subject: string }[]): Promise<void> {
        const ownIssuer = this.configService.get<string>('auth0.issuer');
        for (const { issuer, subject } of identities) {
            if (issuer !== ownIssuer) {
                continue;
            }
            try {
                await this.deleteUser(subject);
            } catch (error: unknown) {
                const reason = error instanceof Error ? error.message : 'unknown error';
                this.logger.warn(`Auth0 account for user ${userId} could not be deleted: ${reason}`);
                captureSentryException(error, { tags: { area: 'auth0_delete' }, contexts: { auth0Cleanup: { userId, subject } } });
            }
        }
    }

    private readSettings(): { issuer: string; clientId: string; clientSecret: string } {
        const issuer = this.configService.get<string>('auth0.issuer');
        const clientId = this.configService.get<string>('auth0.m2mClientId');
        const clientSecret = this.configService.get<string>('auth0.m2mClientSecret');
        if (!issuer || !clientId || !clientSecret) {
            throw new Auth0ManagementError('Auth0 Management API is not configured');
        }
        return { issuer, clientId, clientSecret };
    }

    private readClientId(): string {
        const clientId = this.configService.get<string>('auth0.clientId');
        if (!clientId) {
            throw new Auth0ManagementError('AUTH0_CLIENT_ID is not configured');
        }
        return clientId;
    }

    private readPasswordConnection(): string {
        const connection = this.configService.get<string>('auth0.passwordConnection');
        if (!connection) {
            throw new Auth0ManagementError('Auth0 password connection is not configured');
        }
        return connection;
    }

    private async requestDelete(auth0UserId: string): Promise<void> {
        const { issuer } = this.readSettings();
        const token = await this.getToken();
        const response = await fetch(`${issuer}api/v2/users/${encodeURIComponent(auth0UserId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok || response.status === NOT_FOUND) {
            return;
        }
        throw new Auth0ManagementError(`Auth0 Management API responded ${response.status}`, response.status);
    }

    private async getToken(): Promise<string> {
        if (this.token && this.token.expiresAt > Date.now()) {
            return this.token.value;
        }
        // One token request at a time: concurrent deletes share it instead of each asking Auth0.
        this.tokenRequest ??= this.fetchToken().finally(() => {
            this.tokenRequest = undefined;
        });
        return this.tokenRequest;
    }

    private async fetchToken(): Promise<string> {
        const { issuer, clientId, clientSecret } = this.readSettings();
        const response = await fetch(`${issuer}oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, audience: `${issuer}api/v2/` }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Auth0ManagementError(`Auth0 token request responded ${response.status}`, response.status);
        }
        const body = (await response.json()) as { access_token: string; expires_in: number };
        this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS };
        return body.access_token;
    }
}
