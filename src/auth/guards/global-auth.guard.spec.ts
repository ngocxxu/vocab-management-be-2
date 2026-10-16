import type { AuthUser } from '../interfaces/auth-user.interface';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { IdentityUnauthorizedException } from '../exceptions';
import { AuthIdentityService } from '../services/auth-identity.service';
import { AuthTokenService } from '../services/auth-token.service';
import { GlobalAuthGuard } from './global-auth.guard';

describe('GlobalAuthGuard', () => {
    const auth0User: AuthUser = { id: 'google-oauth2|1', email: null, roles: [], provider: 'auth0', issuer: 'https://t.auth0.com/', subject: 'google-oauth2|1' };

    type TestRequest = { method: string; headers: { authorization?: string }; authUser?: AuthUser; currentUser?: User };

    const createGuard = (options: { authUser?: AuthUser; resolveLocalUser?: jest.Mock; token?: string | null; isPublic?: boolean; allowUnprovisioned?: boolean }) => {
        const reflector = {
            getAllAndOverride: jest.fn((key: string) => (key === 'allowUnprovisioned' ? (options.allowUnprovisioned ?? false) : (options.isPublic ?? false))),
        } as unknown as Reflector;
        const tokens = {
            extractBearerToken: () => (options.token === undefined ? 'valid' : options.token),
            resolveAuthUser: jest.fn().mockResolvedValue(options.authUser ?? auth0User),
        };
        const identity = { resolveLocalUser: options.resolveLocalUser ?? jest.fn().mockResolvedValue(null) };
        const guard = new GlobalAuthGuard(reflector, tokens as unknown as AuthTokenService, identity as unknown as AuthIdentityService);
        return { guard, tokens, identity };
    };

    const context = (request: TestRequest) =>
        ({ switchToHttp: () => ({ getRequest: () => request }), getHandler: () => undefined, getClass: () => undefined }) as unknown as ExecutionContext;
    const newRequest = (): TestRequest => ({ method: 'GET', headers: { authorization: 'Bearer valid' } });

    it('replaces the provider id with the internal users.id on the request', async () => {
        const dbUser = { id: 'internal-1', isActive: true } as User;
        const { guard } = createGuard({ resolveLocalUser: jest.fn().mockResolvedValue(dbUser) });
        const request = newRequest();

        await guard.canActivate(context(request));

        expect(request.authUser?.id).toBe('internal-1');
        expect(request.authUser?.subject).toBe('google-oauth2|1');
        expect(request.currentUser).toBe(dbUser);
    });

    it('rejects an Auth0 identity that is not provisioned', async () => {
        const { guard } = createGuard({ resolveLocalUser: jest.fn().mockRejectedValue(new IdentityUnauthorizedException()) });

        await expect(guard.canActivate(context(newRequest()))).rejects.toThrow('identity_not_provisioned');
    });

    it('rejects when the identity service rejects a deactivated user', async () => {
        const { guard } = createGuard({ resolveLocalUser: jest.fn().mockRejectedValue(new UnauthorizedException('This account has been deleted')) });

        await expect(guard.canActivate(context(newRequest()))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lets an unsynced Supabase user through without a current user', async () => {
        const supabaseUser: AuthUser = { id: 'sb-1', email: null, roles: [], provider: 'supabase' };
        const { guard } = createGuard({ authUser: supabaseUser });
        const request = newRequest();

        await guard.canActivate(context(request));

        expect(request.authUser).toEqual(supabaseUser);
        expect(request.currentUser).toBeUndefined();
    });

    it('lets an unmapped Auth0 identity through only on routes that allow it', async () => {
        const resolveLocalUser = jest.fn().mockResolvedValue(null);
        const { guard } = createGuard({ resolveLocalUser, allowUnprovisioned: true });
        const request = newRequest();

        await guard.canActivate(context(request));

        expect(resolveLocalUser).toHaveBeenCalledWith(auth0User, { allowUnprovisioned: true });
        expect(request.authUser?.subject).toBe('google-oauth2|1');
        expect(request.currentUser).toBeUndefined();
    });

    it('does not allow unprovisioned identities by default', async () => {
        const resolveLocalUser = jest.fn().mockResolvedValue(null);
        const { guard } = createGuard({ resolveLocalUser });

        await guard.canActivate(context(newRequest()));

        expect(resolveLocalUser).toHaveBeenCalledWith(auth0User, { allowUnprovisioned: false });
    });

    it('requires a bearer token on protected routes', async () => {
        const { guard } = createGuard({ token: null });

        await expect(guard.canActivate(context(newRequest()))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('skips authentication on public routes', async () => {
        const { guard, tokens } = createGuard({ isPublic: true, token: null });

        await expect(guard.canActivate(context(newRequest()))).resolves.toBe(true);
        expect(tokens.resolveAuthUser).not.toHaveBeenCalled();
    });
});
