import type { AuthUser } from '../interfaces/auth-user.interface';
import { UnauthorizedException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { Socket } from 'socket.io';
import { IdentityUnauthorizedException } from '../exceptions';
import { AuthIdentityService } from './auth-identity.service';
import { AuthTokenService } from './auth-token.service';
import { WsAuthService } from './ws-auth.service';

describe('WsAuthService', () => {
    const client = { handshake: { headers: { cookie: 'accessToken=token' }, auth: {} } } as unknown as Socket;

    const createService = (authUser: AuthUser, resolveLocalUser: jest.Mock) => {
        const authTokenService = { resolveAuthUser: jest.fn().mockResolvedValue(authUser) };
        const identityService = { resolveLocalUser };
        return new WsAuthService(authTokenService as unknown as AuthTokenService, identityService as unknown as AuthIdentityService);
    };

    const auth0User: AuthUser = { id: 'google-oauth2|1', email: null, roles: [], provider: 'auth0', issuer: 'https://t.auth0.com/', subject: 'google-oauth2|1' };

    it('resolves the internal id and database role for a mapped Auth0 identity', async () => {
        const service = createService(auth0User, jest.fn().mockResolvedValue({ id: 'u1', role: UserRole.MEMBER, isActive: true } as User));

        const authUser = await service.authenticateSocket(client);

        expect(authUser.id).toBe('u1');
        expect(authUser.roles).toEqual([UserRole.MEMBER]);
    });

    it('never trusts role claims from the token', async () => {
        const service = createService({ ...auth0User, roles: [UserRole.ADMIN] }, jest.fn().mockResolvedValue({ id: 'u1', role: UserRole.GUEST, isActive: true } as User));

        const authUser = await service.authenticateSocket(client);

        expect(authUser.roles).toEqual([UserRole.GUEST]);
    });

    it('rejects an Auth0 identity that is not provisioned', async () => {
        const service = createService(auth0User, jest.fn().mockRejectedValue(new IdentityUnauthorizedException()));

        await expect(service.authenticateSocket(client)).rejects.toBeInstanceOf(IdentityUnauthorizedException);
    });

    it('rejects a Supabase user without a database record', async () => {
        const service = createService({ id: 'sb1', email: null, roles: [], provider: 'supabase' }, jest.fn().mockResolvedValue(null));

        await expect(service.authenticateSocket(client)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the identity service rejects a deactivated user', async () => {
        const service = createService(auth0User, jest.fn().mockRejectedValue(new UnauthorizedException('This account has been deleted')));

        await expect(service.authenticateSocket(client)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('resolves the database role for Supabase users', async () => {
        const supabaseUser: AuthUser = { id: 'sb1', email: null, roles: [], provider: 'supabase' };
        const service = createService(supabaseUser, jest.fn().mockResolvedValue({ id: 'u2', role: UserRole.ADMIN, isActive: true } as User));

        const authUser = await service.authenticateSocket(client);

        expect(authUser.id).toBe('u2');
        expect(authUser.roles).toEqual([UserRole.ADMIN]);
    });
});
