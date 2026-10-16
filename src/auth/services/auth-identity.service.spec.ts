import type { AuthUser } from '../interfaces/auth-user.interface';
import { UserIdentityRepository, UserRepository } from '@/domains/identity/user/repositories';
import { UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { IdentityUnauthorizedException } from '../exceptions';
import { AuthIdentityService } from './auth-identity.service';

const ISSUER = 'https://vocab-development.jp.auth0.com/';

describe('AuthIdentityService', () => {
    const create = (repos: { identity?: jest.Mock; supabase?: jest.Mock } = {}) => {
        const identityRepository = { findUserByIdentity: repos.identity ?? jest.fn().mockResolvedValue(null) };
        const userRepository = { findBySupabaseUserId: repos.supabase ?? jest.fn().mockResolvedValue(null) };
        return new AuthIdentityService(userRepository as unknown as UserRepository, identityRepository as unknown as UserIdentityRepository);
    };

    const auth0User: AuthUser = { id: 'google-oauth2|1', email: null, roles: [], provider: 'auth0', issuer: ISSUER, subject: 'google-oauth2|1' };

    it('resolves a mapped Auth0 identity to the internal user', async () => {
        const identity = jest.fn().mockResolvedValue({ id: 'internal-1', isActive: true } as User);

        const user = await create({ identity }).resolveLocalUser(auth0User);

        expect(user?.id).toBe('internal-1');
        expect(identity).toHaveBeenCalledWith(ISSUER, 'google-oauth2|1');
    });

    it('rejects an unmapped Auth0 identity as not provisioned', async () => {
        await expect(create().resolveLocalUser(auth0User)).rejects.toBeInstanceOf(IdentityUnauthorizedException);
    });

    it('never falls back to email matching for Auth0 identities', async () => {
        const supabase = jest.fn();

        await expect(create({ supabase }).resolveLocalUser({ ...auth0User, email: 'owner@example.com' })).rejects.toBeInstanceOf(IdentityUnauthorizedException);

        expect(supabase).not.toHaveBeenCalled();
    });

    it.each([['auth0'], ['supabase']])('rejects a deactivated user resolved through %s', async (provider) => {
        const inactive = jest.fn().mockResolvedValue({ id: 'u', isActive: false } as User);
        const service = create({ identity: inactive, supabase: inactive });
        const authUser: AuthUser = provider === 'auth0' ? auth0User : { id: 'sb-1', email: null, roles: [], provider: 'supabase' };

        await expect(service.resolveLocalUser(authUser)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('resolves a Supabase user by supabase id and may return null', async () => {
        const supabase = jest.fn().mockResolvedValue(null);

        const user = await create({ supabase }).resolveLocalUser({ id: 'sb-1', email: null, roles: [], provider: 'supabase' });

        expect(user).toBeNull();
        expect(supabase).toHaveBeenCalledWith('sb-1');
    });
});
