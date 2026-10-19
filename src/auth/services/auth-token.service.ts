import type { AuthStrategyValue } from '../decorators/auth-strategy.decorator';
import type { Auth0IdToken, AuthUser } from '../interfaces/auth-user.interface';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { Request } from 'express';
import { decodeJwt, JWTPayload, jwtVerify } from 'jose';

import { Auth0JwksProvider } from './auth0-jwks.provider';

const AUTH0_ALGORITHMS = ['RS256'];

function mapSupabaseAuthUser(user: SupabaseUser): AuthUser {
    // user_metadata is writable by the signed-in user, so Supabase claims never grant roles.
    // Empty roles make RolesGuard and WsAuthService fall back to the database role.
    return {
        id: user.id,
        email: user.email ?? null,
        roles: [],
        provider: 'supabase',
    };
}

@Injectable()
export class AuthTokenService {
    private readonly logger = new Logger(AuthTokenService.name);

    public constructor(
        private readonly configService: ConfigService,
        private readonly supabaseAuth: SupabaseAuthProvider,
        private readonly auth0Jwks: Auth0JwksProvider,
    ) {}

    public extractBearerToken(request: Request): string | null {
        const header = request.headers.authorization;
        if (!header?.startsWith('Bearer ')) {
            return null;
        }
        const [, token] = header.split(' ');
        return token || null;
    }

    public async resolveAuthUser(token: string, strategy: AuthStrategyValue): Promise<AuthUser> {
        if (strategy === 'auth0') {
            return this.verifyAuth0(token);
        }
        if (strategy === 'supabase') {
            return this.verifySupabase(token);
        }
        // The unverified `iss` only picks the verifier. A token claiming the Auth0 issuer is fully verified
        // by Auth0 rules and never retried against Supabase, so a forged `iss` gains nothing.
        return this.isIssuedByAuth0(token) ? this.verifyAuth0(token) : this.verifySupabase(token);
    }

    /**
     * Verifies an Auth0 ID token (never an access token, never Supabase): RS256 signature, issuer, `aud` = the web app's client id, `exp`.
     * Used as the proof in the account link (ADR 0004). Every failure is the same `id_token_invalid`; the cause stays in the log.
     */
    public async verifyIdToken(idToken: string): Promise<Auth0IdToken> {
        const issuer = this.configService.get<string>('auth0.issuer');
        const clientId = this.configService.get<string>('auth0.clientId');
        if (!issuer || !clientId) {
            throw new UnauthorizedException('id_token_invalid');
        }
        try {
            const { payload } = await jwtVerify(idToken, this.auth0Jwks.getKeyResolver(), {
                issuer,
                audience: clientId,
                algorithms: AUTH0_ALGORITHMS,
                requiredClaims: ['sub', 'exp'],
            });
            if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
                throw new UnauthorizedException('id_token_invalid');
            }
            return {
                issuer,
                subject: payload.sub,
                nonce: typeof payload.nonce === 'string' && payload.nonce.length > 0 ? payload.nonce : undefined,
                authTime: typeof payload.auth_time === 'number' ? payload.auth_time : undefined,
                email: typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : null,
                // Only a real boolean `true` verifies; the string "true" does not.
                emailVerified: payload.email_verified === true,
            };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            this.logger.warn(`Auth0 ID token rejected: ${error instanceof Error ? error.name : 'unknown error'}`);
            throw new UnauthorizedException('id_token_invalid');
        }
    }

    private isIssuedByAuth0(token: string): boolean {
        const issuer = this.configService.get<string>('auth0.issuer');
        if (!issuer) {
            return false;
        }
        try {
            return decodeJwt(token).iss === issuer;
        } catch {
            return false;
        }
    }

    private async verifyAuth0(token: string): Promise<AuthUser> {
        const issuer = this.configService.get<string>('auth0.issuer');
        const audience = this.configService.get<string>('auth0.audience');
        if (!issuer || !audience) {
            throw new UnauthorizedException('Invalid or expired token');
        }
        try {
            const { payload } = await jwtVerify(token, this.auth0Jwks.getKeyResolver(), {
                issuer,
                audience,
                algorithms: AUTH0_ALGORITHMS,
                requiredClaims: ['sub', 'exp'],
            });
            if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
                throw new UnauthorizedException('Invalid or expired token');
            }
            const claims = this.readNamespacedClaims(payload);
            // Roles come only from the database, so token role claims are never read.
            return {
                id: payload.sub,
                email: claims.email,
                emailVerified: claims.emailVerified,
                profile: claims.profile,
                roles: [],
                provider: 'auth0',
                issuer,
                subject: payload.sub,
                clientId: typeof payload.azp === 'string' ? payload.azp : null,
            };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            // Callers get one generic message; the cause (expired, wrong audience, key fetch failure) stays in the log.
            this.logger.warn(`Auth0 token rejected: ${error instanceof Error ? error.name : 'unknown error'}`);
            throw new UnauthorizedException('Invalid or expired token');
        }
    }

    /** Auth0 only puts custom claims in access tokens under a namespace; without one nothing is read and the email counts as unverified. */
    private readNamespacedClaims(payload: JWTPayload): { email: string | null; emailVerified: boolean; profile: AuthUser['profile'] } {
        const namespace = this.configService.get<string>('auth0.claimNamespace');
        const text = (name: string): string | undefined => {
            const value = namespace ? payload[`${namespace}${name}`] : undefined;
            return typeof value === 'string' && value.length > 0 ? value : undefined;
        };
        return {
            email: text('email') ?? null,
            // Only a real boolean `true` verifies; the string "true" does not.
            emailVerified: namespace ? payload[`${namespace}email_verified`] === true : false,
            profile: { firstName: text('given_name'), lastName: text('family_name'), avatar: text('picture') },
        };
    }

    private async verifySupabase(token: string): Promise<AuthUser> {
        const {
            data: { user },
            error,
        } = await this.supabaseAuth.getAnonClient().auth.getUser(token);
        if (error || !user) {
            throw new UnauthorizedException('Invalid or expired token');
        }
        // Cutover signal: when this line stops appearing for 14 days, the Supabase path can go (docs/runbooks/auth0-cutover.md).
        this.logger.log(`supabase_token_accepted user=${user.id}`);
        return mapSupabaseAuthUser(user);
    }
}
