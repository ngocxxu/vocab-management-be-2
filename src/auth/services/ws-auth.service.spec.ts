import type { AuthUser } from '../interfaces/auth-user.interface';
import { UnauthorizedException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { Socket } from 'socket.io';
import { AuthTokenService } from './auth-token.service';
import { WsAuthService } from './ws-auth.service';

describe('WsAuthService database role', () => {
    const client = { handshake: { headers: { cookie: 'accessToken=token' }, auth: {} } } as unknown as Socket;

    const createService = (authUser: AuthUser, repo: { findById?: jest.Mock; findBySupabaseUserId?: jest.Mock }) => {
        const authTokenService = { resolveAuthUser: jest.fn().mockResolvedValue(authUser) };
        const userRepository = {
            findById: jest.fn().mockResolvedValue(null),
            findBySupabaseUserId: jest.fn().mockResolvedValue(null),
            ...repo,
        };
        return new WsAuthService(authTokenService as unknown as AuthTokenService, userRepository as never);
    };

    it('resolves the database role for application JWT users', async () => {
        const findById = jest.fn().mockResolvedValue({ id: 'u1', role: UserRole.MEMBER } as User);
        const service = createService({ id: 'u1', email: null, roles: [], provider: 'jwt' }, { findById });

        const authUser = await service.authenticateSocket(client);

        expect(authUser.roles).toEqual([UserRole.MEMBER]);
    });

    it('rejects an application JWT user without a database record', async () => {
        const service = createService({ id: 'ghost', email: null, roles: [UserRole.ADMIN], provider: 'jwt' }, {});

        await expect(service.authenticateSocket(client)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('resolves the database role for Supabase users', async () => {
        const service = createService(
            { id: 'sb1', email: null, roles: [], provider: 'supabase' },
            { findBySupabaseUserId: jest.fn().mockResolvedValue({ id: 'u2', role: UserRole.ADMIN } as User) },
        );

        const authUser = await service.authenticateSocket(client);

        expect(authUser.id).toBe('u2');
        expect(authUser.roles).toEqual([UserRole.ADMIN]);
    });
});
