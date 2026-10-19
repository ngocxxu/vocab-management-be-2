import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, exportJWK, generateKeyPair, JWK, JWTPayload, KeyLike, SignJWT } from 'jose';
import { AuthTokenService } from './auth-token.service';
import { Auth0JwksProvider } from './auth0-jwks.provider';

const ISSUER = 'https://vocab-development.jp.auth0.com/';
const AUDIENCE = 'https://api.vocab.test';
const KID = 'test-key';

describe('AuthTokenService', () => {
    let privateKey: KeyLike;
    let otherPrivateKey: KeyLike;
    let jwks: ReturnType<typeof createLocalJWKSet>;

    beforeAll(async () => {
        const pair = await generateKeyPair('RS256');
        privateKey = pair.privateKey;
        const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
        jwks = createLocalJWKSet({ keys: [publicJwk] });
        otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
    });

    const createService = (options: { supabaseUser?: unknown; auth0?: { issuer?: string; audience?: string } } = {}) => {
        const auth0 = options.auth0 ?? { issuer: ISSUER, audience: AUDIENCE };
        const values: Record<string, string | undefined> = { 'auth0.issuer': auth0.issuer, 'auth0.audience': auth0.audience, 'auth0.claimNamespace': 'https://vocab.app/' };
        const config = { get: (key: string) => values[key] } as unknown as ConfigService;
        const getUser = jest.fn().mockResolvedValue({ data: { user: options.supabaseUser }, error: options.supabaseUser ? null : { message: 'bad' } });
        const supabaseAuth = { getAnonClient: () => ({ auth: { getUser } }) } as unknown as SupabaseAuthProvider;
        const jwksProvider = { getKeyResolver: () => jwks } as unknown as Auth0JwksProvider;
        return { service: new AuthTokenService(config, supabaseAuth, jwksProvider), getUser };
    };

    const sign = async (claims: JWTPayload = {}, overrides: { iss?: string; aud?: string; exp?: string | number; sub?: string | null; key?: KeyLike; alg?: string } = {}) => {
        const builder = new SignJWT({ email: 'a@b.com', ...claims })
            .setProtectedHeader({ alg: overrides.alg ?? 'RS256', kid: KID })
            .setIssuer(overrides.iss ?? ISSUER)
            .setAudience(overrides.aud ?? AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(overrides.exp ?? '5m');
        if (overrides.sub !== null) {
            builder.setSubject(overrides.sub ?? 'google-oauth2|123');
        }
        return builder.sign(overrides.key ?? privateKey);
    };

    describe('auth0 tokens', () => {
        it('accepts a valid token and exposes issuer, subject and client', async () => {
            const { service } = createService();
            const token = await sign({ azp: 'client-1' });

            const authUser = await service.resolveAuthUser(token, 'auth0');

            expect(authUser).toMatchObject({ provider: 'auth0', issuer: ISSUER, subject: 'google-oauth2|123', clientId: 'client-1', roles: [] });
        });

        it('exposes when the token was issued, in seconds, so callers can demand a fresh sign-in', async () => {
            const { service } = createService();
            const before = Math.floor(Date.now() / 1000);
            const token = await sign();

            const authUser = await service.resolveAuthUser(token, 'auth0');

            expect(authUser.issuedAt).toBeGreaterThanOrEqual(before);
            expect(authUser.issuedAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
        });

        it('reads email and profile only from namespaced claims', async () => {
            const { service } = createService();
            const token = await sign({
                email: 'plain@example.com',
                'https://vocab.app/email': 'owner@example.com',
                'https://vocab.app/email_verified': true,
                'https://vocab.app/given_name': 'Ada',
                'https://vocab.app/family_name': 'Lovelace',
                'https://vocab.app/picture': 'https://img/a.png',
            });

            const authUser = await service.resolveAuthUser(token, 'auth0');

            expect(authUser).toMatchObject({ email: 'owner@example.com', emailVerified: true, profile: { firstName: 'Ada', lastName: 'Lovelace', avatar: 'https://img/a.png' } });
        });

        it('treats a missing or non-boolean email_verified claim as unverified', async () => {
            const { service } = createService();
            const token = await sign({ 'https://vocab.app/email': 'owner@example.com', 'https://vocab.app/email_verified': 'true' });

            const authUser = await service.resolveAuthUser(token, 'auth0');

            expect(authUser.emailVerified).toBe(false);
        });

        it('never grants roles from token claims', async () => {
            const { service } = createService();
            const token = await sign({ roles: ['ADMIN'], 'https://vocab/roles': ['ADMIN'] });

            const authUser = await service.resolveAuthUser(token, 'auth0');

            expect(authUser.roles).toEqual([]);
        });

        it.each([
            ['expired', { exp: Math.floor(Date.now() / 1000) - 60 }],
            ['wrong issuer', { iss: 'https://evil.example.com/' }],
            ['wrong audience', { aud: 'https://other.api' }],
            ['missing subject', { sub: null }],
        ])('rejects a token that is %s', async (_name, overrides) => {
            const { service } = createService();
            const token = await sign({}, overrides);

            await expect(service.resolveAuthUser(token, 'auth0')).rejects.toBeInstanceOf(UnauthorizedException);
        });

        it('rejects a token signed by an unknown key', async () => {
            const { service } = createService();
            const token = await sign({}, { key: otherPrivateKey });

            await expect(service.resolveAuthUser(token, 'auth0')).rejects.toBeInstanceOf(UnauthorizedException);
        });

        it('rejects an HS256 token even when signed with a shared secret', async () => {
            const { service } = createService();
            const token = await new SignJWT({})
                .setProtectedHeader({ alg: 'HS256', kid: KID })
                .setIssuer(ISSUER)
                .setAudience(AUDIENCE)
                .setSubject('x')
                .setExpirationTime('5m')
                .sign(new TextEncoder().encode('secret'));

            await expect(service.resolveAuthUser(token, 'auth0')).rejects.toBeInstanceOf(UnauthorizedException);
        });

        it('rejects an unsigned token', async () => {
            const { service } = createService();
            const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
            const payload = Buffer.from(JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: 'x', exp: 9999999999 })).toString('base64url');

            await expect(service.resolveAuthUser(`${header}.${payload}.`, 'auth0')).rejects.toBeInstanceOf(UnauthorizedException);
        });

        it('picks up a rotated signing key without a restart', async () => {
            const rotated = await generateKeyPair('RS256');
            const rotatedJwk: JWK = { ...(await exportJWK(rotated.publicKey)), kid: 'rotated-key', alg: 'RS256', use: 'sig' };
            const publicJwk = await exportJWK((await generateKeyPair('RS256')).publicKey);
            let current = createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'old-key', alg: 'RS256', use: 'sig' }] });
            const config = { get: (key: string) => ({ 'auth0.issuer': ISSUER, 'auth0.audience': AUDIENCE })[key] } as unknown as ConfigService;
            const jwksProvider = { getKeyResolver: () => current } as unknown as Auth0JwksProvider;
            const service = new AuthTokenService(config, {} as SupabaseAuthProvider, jwksProvider);
            const token = await new SignJWT({})
                .setProtectedHeader({ alg: 'RS256', kid: 'rotated-key' })
                .setIssuer(ISSUER)
                .setAudience(AUDIENCE)
                .setSubject('rot|1')
                .setExpirationTime('5m')
                .sign(rotated.privateKey);

            await expect(service.resolveAuthUser(token, 'auth0')).rejects.toBeInstanceOf(UnauthorizedException);
            current = createLocalJWKSet({ keys: [rotatedJwk] });

            await expect(service.resolveAuthUser(token, 'auth0')).resolves.toMatchObject({ subject: 'rot|1' });
        });

        it('rejects every token when Auth0 is not configured', async () => {
            const { service } = createService({ auth0: {} });
            const token = await sign();

            await expect(service.resolveAuthUser(token, 'auth0')).rejects.toBeInstanceOf(UnauthorizedException);
        });
    });

    describe('combined strategy', () => {
        it('routes a token from the configured Auth0 issuer to Auth0 and never to Supabase', async () => {
            const { service, getUser } = createService({ supabaseUser: { id: 'sb-1', email: 'x@y.z' } });
            const token = await sign();

            const authUser = await service.resolveAuthUser(token, 'combined');

            expect(authUser.provider).toBe('auth0');
            expect(getUser).not.toHaveBeenCalled();
        });

        it('does not fall back to Supabase when an Auth0-issued token is invalid', async () => {
            const { service, getUser } = createService({ supabaseUser: { id: 'sb-1', email: 'x@y.z' } });
            const token = await sign({}, { aud: 'https://other.api' });

            await expect(service.resolveAuthUser(token, 'combined')).rejects.toBeInstanceOf(UnauthorizedException);
            expect(getUser).not.toHaveBeenCalled();
        });

        it('keeps accepting Supabase tokens during the migration window', async () => {
            const { service } = createService({ supabaseUser: { id: 'sb-1', email: 'x@y.z' } });
            const token = await sign({}, { iss: 'https://project.supabase.co/auth/v1' });

            const authUser = await service.resolveAuthUser(token, 'combined');

            expect(authUser).toMatchObject({ provider: 'supabase', id: 'sb-1' });
        });
    });

    describe('supabase tokens', () => {
        it('logs a greppable line for every accepted Supabase token', async () => {
            const { service } = createService({ supabaseUser: { id: 'supabase-user-1', email: 'user@example.com' } });
            const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

            await service.resolveAuthUser('supabase-token', 'supabase');

            expect(log).toHaveBeenCalledWith('supabase_token_accepted user=supabase-user-1');
            log.mockRestore();
        });

        it('ignores role claims in Supabase user metadata', async () => {
            const { service } = createService({
                supabaseUser: { id: 'supabase-user-1', email: 'user@example.com', user_metadata: { roles: ['ADMIN'] }, app_metadata: { roles: ['ADMIN'] } },
            });

            const authUser = await service.resolveAuthUser('supabase-token', 'supabase');

            expect(authUser.provider).toBe('supabase');
            expect(authUser.roles).toEqual([]);
        });
    });
});
