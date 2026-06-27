import type { AuthUser } from '../interfaces/auth-user.interface';
import { UserRepository } from '@/domains/identity/user/repositories';
import { extractCookieValue } from '@/shared';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';

import { AuthTokenService } from './auth-token.service';

@Injectable()
export class WsAuthService {
    private readonly logger = new Logger(WsAuthService.name);

    public constructor(
        private readonly authTokenService: AuthTokenService,
        private readonly userRepository: UserRepository,
    ) {}

    public async authenticateSocket(client: Socket): Promise<AuthUser> {
        const token = this.extractToken(client);
        if (!token) {
            throw new UnauthorizedException('Missing auth token');
        }
        const authUser = await this.authTokenService.resolveAuthUser(token, 'combined');

        if (authUser.provider === 'supabase') {
            const localUser = await this.userRepository.findBySupabaseUserId(authUser.id);
            if (!localUser) {
                throw new UnauthorizedException('User not registered');
            }
            return { ...authUser, id: localUser.id, roles: authUser.roles.length > 0 ? authUser.roles : [localUser.role] };
        }

        return authUser;
    }

    private extractToken(client: Socket): string | null {
        const cookieHeader = client.handshake.headers.cookie;
        this.logger.warn(`WS handshake cookie: ${cookieHeader ?? '(none)'}`);
        this.logger.warn(`WS handshake auth: ${JSON.stringify(client.handshake.auth)}`);
        this.logger.warn(`WS handshake authorization: ${client.handshake.headers.authorization ?? '(none)'}`);
        const cookieToken = extractCookieValue(cookieHeader, 'accessToken');
        if (cookieToken) return cookieToken;

        const authHeader = client.handshake.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

        const authData = client.handshake.auth as Record<string, unknown>;
        if (typeof authData?.token === 'string') return authData.token;

        return null;
    }
}
