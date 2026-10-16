import type { AuthUser } from '../interfaces/auth-user.interface';
import { extractCookieValue } from '@/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';

import { AuthIdentityService } from './auth-identity.service';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class WsAuthService {
    public constructor(
        private readonly authTokenService: AuthTokenService,
        private readonly authIdentityService: AuthIdentityService,
    ) {}

    public async authenticateSocket(client: Socket): Promise<AuthUser> {
        const token = this.extractToken(client);
        if (!token) {
            throw new UnauthorizedException('Missing auth token');
        }
        const authUser = await this.authTokenService.resolveAuthUser(token, 'combined');

        const localUser = await this.authIdentityService.resolveLocalUser(authUser);
        if (!localUser) {
            throw new UnauthorizedException('User not registered');
        }

        // The database role is the single source of truth; token role claims are never trusted.
        return { ...authUser, id: localUser.id, roles: [localUser.role] };
    }

    private extractToken(client: Socket): string | null {
        const cookieHeader = client.handshake.headers.cookie;
        const cookieToken = extractCookieValue(cookieHeader, 'accessToken');
        if (cookieToken) return cookieToken;

        const authHeader = client.handshake.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

        const authData = client.handshake.auth as Record<string, unknown>;
        if (typeof authData?.token === 'string') return authData.token;

        return null;
    }
}
