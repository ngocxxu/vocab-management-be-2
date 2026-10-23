import { captureSentryException } from '@/shared/utils/sentry.util';
import { ConfigService } from '@nestjs/config';
import { Auth0ManagementService } from './auth0-management.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const ISSUER = 'https://vocab-development.jp.auth0.com/';

type FetchCall = { url: string; init: RequestInit };

describe('Auth0ManagementService', () => {
    let calls: FetchCall[];
    let deleteStatus: number;
    let tokenStatus: number;
    let createStatus: number;
    let changePasswordStatus: number;
    let userStatus: number;
    let userBody: Record<string, unknown>;
    let usersByEmailStatus: number;
    let usersByEmailBody: unknown[];
    let verificationStatus: number;
    const realFetch = global.fetch;

    const createService = (overrides: Record<string, string | undefined> = {}) => {
        const values: Record<string, string | undefined> = {
            'auth0.issuer': ISSUER,
            'auth0.m2mClientId': 'm2m-id',
            'auth0.m2mClientSecret': 'm2m-secret',
            'auth0.clientId': 'web-client',
            'auth0.passwordConnection': 'Username-Password-Authentication',
            ...overrides,
        };
        return new Auth0ManagementService({ get: (key: string) => values[key] } as unknown as ConfigService);
    };

    beforeEach(() => {
        calls = [];
        deleteStatus = 204;
        tokenStatus = 200;
        createStatus = 201;
        changePasswordStatus = 200;
        userStatus = 200;
        userBody = { user_id: 'auth0|a', last_password_reset: '2026-10-17T09:00:00.000Z' };
        usersByEmailStatus = 200;
        usersByEmailBody = [];
        verificationStatus = 201;
        (captureSentryException as jest.Mock).mockClear();
        global.fetch = jest.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
            const target = String(url);
            calls.push({ url: target, init });
            if (target.endsWith('/oauth/token')) {
                return Promise.resolve(new Response(JSON.stringify({ access_token: 'mgmt-token', expires_in: 3600 }), { status: tokenStatus }));
            }
            if (target.endsWith('/api/v2/users') && init.method === 'POST') {
                return Promise.resolve(new Response(JSON.stringify(createStatus === 201 ? { user_id: 'auth0|new123' } : {}), { status: createStatus }));
            }
            if (target.includes('/api/v2/users/') && (init.method ?? 'GET') === 'GET') {
                return Promise.resolve(new Response(JSON.stringify(userBody), { status: userStatus }));
            }
            if (target.includes('/api/v2/users-by-email')) {
                return Promise.resolve(new Response(JSON.stringify(usersByEmailBody), { status: usersByEmailStatus }));
            }
            if (target.endsWith('/api/v2/jobs/verification-email')) {
                return Promise.resolve(new Response(JSON.stringify({ status: 'completed' }), { status: verificationStatus }));
            }
            if (target.endsWith('/dbconnections/change_password')) {
                return Promise.resolve(new Response('We sent you an email', { status: changePasswordStatus }));
            }
            return Promise.resolve(new Response(null, { status: deleteStatus }));
        }) as unknown as typeof fetch;
    });

    afterAll(() => {
        global.fetch = realFetch;
    });

    const deletes = () => calls.filter((call) => call.init.method === 'DELETE');

    describe('deleteUser', () => {
        it('deletes the Auth0 user with a client-credentials bearer token and an encoded id', async () => {
            await createService().deleteUser('google-oauth2|123');

            const [tokenCall] = calls;
            expect(tokenCall.url).toBe(`${ISSUER}oauth/token`);
            expect(JSON.parse(String(tokenCall.init.body))).toEqual({
                grant_type: 'client_credentials',
                client_id: 'm2m-id',
                client_secret: 'm2m-secret',
                audience: `${ISSUER}api/v2/`,
            });
            expect(deletes()[0].url).toBe(`${ISSUER}api/v2/users/google-oauth2%7C123`);
            expect((deletes()[0].init.headers as Record<string, string>).Authorization).toBe('Bearer mgmt-token');
        });

        it('reuses the cached token across calls', async () => {
            const service = createService();

            await service.deleteUser('auth0|a');
            await service.deleteUser('auth0|b');

            expect(calls.filter((call) => call.url.endsWith('/oauth/token'))).toHaveLength(1);
            expect(deletes()).toHaveLength(2);
        });

        it('treats a 404 as already deleted', async () => {
            deleteStatus = 404;

            await expect(createService().deleteUser('auth0|gone')).resolves.toBeUndefined();
        });

        it('throws on any other failure', async () => {
            deleteStatus = 500;

            await expect(createService().deleteUser('auth0|a')).rejects.toThrow('Auth0 Management API responded 500');
        });

        it('throws without calling Auth0 when the machine-to-machine client is not configured', async () => {
            await expect(createService({ 'auth0.m2mClientSecret': undefined }).deleteUser('auth0|a')).rejects.toThrow('not configured');

            expect(calls).toHaveLength(0);
        });

        it('fails fast once the circuit is open, without calling Auth0 again', async () => {
            deleteStatus = 500;
            const service = createService();
            for (let attempt = 0; attempt < 3; attempt += 1) {
                await expect(service.deleteUser('auth0|a')).rejects.toThrow();
            }
            const callsBefore = calls.length;

            await expect(service.deleteUser('auth0|a')).rejects.toMatchObject({ code: 'EOPENBREAKER' });

            expect(calls).toHaveLength(callsBefore);
        });

        it('counts a 429 toward opening the circuit', async () => {
            deleteStatus = 429;
            const service = createService();
            for (let attempt = 0; attempt < 3; attempt += 1) {
                await expect(service.deleteUser('auth0|a')).rejects.toThrow('429');
            }

            await expect(service.deleteUser('auth0|a')).rejects.toMatchObject({ code: 'EOPENBREAKER' });
        });

        it('does not count a 4xx answer toward opening the circuit', async () => {
            deleteStatus = 403;
            const service = createService();
            for (let attempt = 0; attempt < 5; attempt += 1) {
                await expect(service.deleteUser('auth0|a')).rejects.toThrow('403');
            }

            await expect(service.deleteUser('auth0|a')).rejects.not.toMatchObject({ code: 'EOPENBREAKER' });
        });
    });

    describe('createPasswordUser', () => {
        const creates = () => calls.filter((call) => call.url.endsWith('/api/v2/users') && call.init.method === 'POST');

        it('creates an unverified user on the password connection with a throwaway password and an app_metadata marker, and returns its id', async () => {
            const userId = await createService().createPasswordUser('ada@example.com');

            expect(userId).toBe('auth0|new123');
            const body = JSON.parse(String(creates()[0].init.body)) as Record<string, unknown>;
            expect(body).toMatchObject({
                connection: 'Username-Password-Authentication',
                email: 'ada@example.com',
                email_verified: false,
                verify_email: false,
                app_metadata: { created_by: 'vocab-backend' },
            });
            expect(String(body.password).length).toBeGreaterThanOrEqual(40);
            expect(body).not.toHaveProperty('user_metadata');
            expect((creates()[0].init.headers as Record<string, string>).Authorization).toBe('Bearer mgmt-token');
        });

        it('uses a different password every time', async () => {
            const service = createService();

            await service.createPasswordUser('a@example.com');
            await service.createPasswordUser('b@example.com');

            const [first, second] = creates().map((call) => (JSON.parse(String(call.init.body)) as { password: string }).password);
            expect(first).not.toBe(second);
        });

        it('returns null when a login with that email already exists', async () => {
            createStatus = 409;

            await expect(createService().createPasswordUser('ada@example.com')).resolves.toBeNull();
        });

        it('does not count a 409 toward opening the circuit', async () => {
            createStatus = 409;
            const service = createService();
            for (let attempt = 0; attempt < 5; attempt += 1) {
                await expect(service.createPasswordUser('ada@example.com')).resolves.toBeNull();
            }

            expect(creates()).toHaveLength(5);
        });

        it('throws on any other failure', async () => {
            createStatus = 500;

            await expect(createService().createPasswordUser('ada@example.com')).rejects.toThrow('Auth0 Management API responded 500');
        });

        it('throws without calling Auth0 when the machine-to-machine client is not configured', async () => {
            await expect(createService({ 'auth0.m2mClientId': undefined }).createPasswordUser('ada@example.com')).rejects.toThrow('not configured');

            expect(calls).toHaveLength(0);
        });
    });

    describe('sendPasswordSetEmail', () => {
        const changes = () => calls.filter((call) => call.url.endsWith('/dbconnections/change_password'));

        it('asks Auth0 to send the email, without a bearer token and without receiving the link', async () => {
            await createService().sendPasswordSetEmail('ada@example.com');

            expect(changes()).toHaveLength(1);
            expect(JSON.parse(String(changes()[0].init.body))).toEqual({ client_id: 'web-client', email: 'ada@example.com', connection: 'Username-Password-Authentication' });
            expect(changes()[0].init.headers).not.toHaveProperty('Authorization');
        });

        it('throws when Auth0 refuses', async () => {
            changePasswordStatus = 400;

            await expect(createService().sendPasswordSetEmail('ada@example.com')).rejects.toThrow('400');
        });

        it('throws without calling Auth0 when the client id is not configured', async () => {
            await expect(createService({ 'auth0.clientId': undefined }).sendPasswordSetEmail('ada@example.com')).rejects.toThrow('AUTH0_CLIENT_ID');

            expect(changes()).toHaveLength(0);
        });
    });

    describe('getLastPasswordReset', () => {
        const reads = () => calls.filter((call) => call.url.includes('/api/v2/users/') && (call.init.method ?? 'GET') === 'GET');

        it('returns when the User last set a password, with a bearer token and no `fields` filter (Auth0 answers 400 to it)', async () => {
            const lastReset = await createService().getLastPasswordReset('auth0|a1');

            expect(lastReset).toBe('2026-10-17T09:00:00.000Z');
            expect(reads()[0].url).toBe(`${ISSUER}api/v2/users/auth0%7Ca1`);
            expect((reads()[0].init.headers as Record<string, string>).Authorization).toBe('Bearer mgmt-token');
        });

        it('returns null when the User has never set a password', async () => {
            userBody = { user_id: 'auth0|a' };

            await expect(createService().getLastPasswordReset('auth0|a')).resolves.toBeNull();
        });

        it('returns null when Auth0 no longer has the user', async () => {
            userStatus = 404;

            await expect(createService().getLastPasswordReset('auth0|gone')).resolves.toBeNull();
        });

        it('throws on any other failure, so the caller does not guess', async () => {
            userStatus = 500;

            await expect(createService().getLastPasswordReset('auth0|a')).rejects.toThrow('Auth0 Management API responded 500');
        });
    });

    describe('sendVerificationEmail', () => {
        const verifications = () => calls.filter((call) => call.url.endsWith('/api/v2/jobs/verification-email'));

        it('asks Auth0 to send the verification email for the user, through the web client', async () => {
            await createService().sendVerificationEmail('auth0|unverified');

            expect(verifications()).toHaveLength(1);
            expect(JSON.parse(String(verifications()[0].init.body))).toEqual({ user_id: 'auth0|unverified', client_id: 'web-client' });
            expect((verifications()[0].init.headers as Record<string, string>).Authorization).toBe('Bearer mgmt-token');
        });

        it('throws when Auth0 refuses', async () => {
            verificationStatus = 400;

            await expect(createService().sendVerificationEmail('auth0|unverified')).rejects.toThrow('400');
        });

        it('throws without calling Auth0 when the client id is not configured', async () => {
            await expect(createService({ 'auth0.clientId': undefined }).sendVerificationEmail('auth0|unverified')).rejects.toThrow('AUTH0_CLIENT_ID');

            expect(verifications()).toHaveLength(0);
        });
    });

    describe('deleteIdentities', () => {
        const identities = [
            { issuer: ISSUER, subject: 'google-oauth2|1' },
            { issuer: 'https://other-tenant.auth0.com/', subject: 'auth0|other' },
            { issuer: ISSUER, subject: 'auth0|2' },
        ];

        it('deletes only the identities that belong to this tenant', async () => {
            await createService().deleteIdentities('u-1', identities);

            expect(deletes().map((call) => call.url)).toEqual([`${ISSUER}api/v2/users/google-oauth2%7C1`, `${ISSUER}api/v2/users/auth0%7C2`]);
        });

        it('never throws: an outage is captured with the user id and subject, and the other identities are still tried', async () => {
            deleteStatus = 500;

            await expect(createService().deleteIdentities('u-1', identities)).resolves.toBeUndefined();

            expect(captureSentryException).toHaveBeenCalledTimes(2);
            expect(captureSentryException).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ contexts: { auth0Cleanup: { userId: 'u-1', subject: 'google-oauth2|1' } } }),
            );
        });

        it('never puts the client secret or token in what it captures', async () => {
            deleteStatus = 500;

            await createService().deleteIdentities('u-1', identities);

            expect(JSON.stringify((captureSentryException as jest.Mock).mock.calls)).not.toMatch(/m2m-secret|mgmt-token/);
        });
    });
});
