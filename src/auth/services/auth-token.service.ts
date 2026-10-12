import type { AuthStrategyValue } from '../decorators/auth-strategy.decorator';
import type { AuthUser } from '../interfaces/auth-user.interface';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { JsonWebTokenError, JwtPayload, NotBeforeError, TokenExpiredError } from 'jsonwebtoken';

function mapJwtPayload(payload: JwtPayload): AuthUser {
    const sub = payload.sub;
    if (!sub || typeof sub !== 'string') {
        throw new UnauthorizedException('Invalid token payload');
    }
    const record = payload as Record<string, unknown>;
    const emailRaw = record.email;
    const email = typeof emailRaw === 'string' ? emailRaw : null;
    // The database role is the single source of truth, so a token role claim never grants access.
    return {
        id: sub,
        email,
        roles: [],
        provider: 'jwt',
    };
}

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
    public constructor(
        private readonly configService: ConfigService,
        private readonly supabaseAuth: SupabaseAuthProvider,
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
        if (strategy === 'jwt') {
            return this.verifyJwt(token);
        }
        if (strategy === 'supabase') {
            return this.verifySupabase(token);
        }
        return this.verifyCombined(token);
    }

    private verifyJwt(token: string): AuthUser {
        try {
            const secret = this.configService.getOrThrow<string>('jwt.secret');
            const issuer = this.configService.getOrThrow<string>('jwt.issuer');
            const payload = jwt.verify(token, secret, {
                algorithms: ['HS256'],
                issuer,
            });
            if (typeof payload === 'string') {
                throw new UnauthorizedException('Invalid token');
            }
            return mapJwtPayload(payload);
        } catch (err) {
            if (err instanceof UnauthorizedException) {
                throw err;
            }
            if (err instanceof TokenExpiredError || err instanceof NotBeforeError) {
                throw new UnauthorizedException(err.message);
            }
            if (err instanceof JsonWebTokenError) {
                throw new UnauthorizedException(err.message);
            }
            throw new UnauthorizedException('Invalid token');
        }
    }

    private async verifySupabase(token: string): Promise<AuthUser> {
        const {
            data: { user },
            error,
        } = await this.supabaseAuth.getAnonClient().auth.getUser(token);
        if (error || !user) {
            throw new UnauthorizedException('Invalid or expired token');
        }
        return mapSupabaseAuthUser(user);
    }

    private async verifyCombined(token: string): Promise<AuthUser> {
        try {
            const secret = this.configService.getOrThrow<string>('jwt.secret');
            const issuer = this.configService.getOrThrow<string>('jwt.issuer');
            const payload = jwt.verify(token, secret, {
                algorithms: ['HS256'],
                issuer,
            });
            if (typeof payload === 'string') {
                return this.verifySupabase(token);
            }
            return mapJwtPayload(payload);
        } catch (err) {
            if (err instanceof UnauthorizedException) {
                throw err;
            }
            if (err instanceof TokenExpiredError || err instanceof NotBeforeError) {
                throw new UnauthorizedException(err.message);
            }
            if (err instanceof JsonWebTokenError) {
                return this.verifySupabase(token);
            }
            throw new UnauthorizedException('Invalid token');
        }
    }
}
