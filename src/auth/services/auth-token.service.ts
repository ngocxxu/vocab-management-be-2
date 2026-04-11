import type { AuthStrategyValue } from '../decorators/auth-strategy.decorator';
import type { AuthUser } from '../interfaces/auth-user.interface';
import { FirebaseConfig } from '@/domains/notification/push/firebase/firebase.config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JsonWebTokenError, JwtPayload, NotBeforeError, TokenExpiredError } from 'jsonwebtoken';
import * as jwt from 'jsonwebtoken';

function normalizeRoles(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((r): r is string => typeof r === 'string');
    }
    if (typeof value === 'string' && value.length > 0) {
        return [value];
    }
    return [];
}

function mapJwtPayload(payload: JwtPayload): AuthUser {
    const sub = payload.sub;
    if (!sub || typeof sub !== 'string') {
        throw new UnauthorizedException('Invalid token payload');
    }
    const record = payload as Record<string, unknown>;
    const emailRaw = record.email;
    const email = typeof emailRaw === 'string' ? emailRaw : null;
    return {
        id: sub,
        email,
        roles: normalizeRoles(record.roles),
        provider: 'jwt',
    };
}

@Injectable()
export class AuthTokenService {
    public constructor(
        private readonly configService: ConfigService,
        private readonly firebaseConfig: FirebaseConfig,
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
        if (strategy === 'firebase') {
            return this.verifyFirebase(token);
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

    private async verifyFirebase(token: string): Promise<AuthUser> {
        try {
            const decoded = await this.firebaseConfig.verifyIdToken(token);
            const raw = decoded as Record<string, unknown>;
            return {
                id: decoded.uid,
                email: decoded.email ?? null,
                roles: normalizeRoles(raw.roles),
                provider: 'firebase',
            };
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
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
                return this.verifyFirebase(token);
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
                return this.verifyFirebase(token);
            }
            throw new UnauthorizedException('Invalid token');
        }
    }
}
