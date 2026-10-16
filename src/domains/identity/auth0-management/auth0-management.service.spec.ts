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
    const realFetch = global.fetch;

    const createService = (overrides: Record<string, string | undefined> = {}) => {
        const values: Record<string, string | undefined> = {
            'auth0.issuer': ISSUER,
            'auth0.m2mClientId': 'm2m-id',
            'auth0.m2mClientSecret': 'm2m-secret',
            ...overrides,
        };
        return new Auth0ManagementService({ get: (key: string) => values[key] } as unknown as ConfigService);
    };

    beforeEach(() => {
        calls = [];
        deleteStatus = 204;
        tokenStatus = 200;
        (captureSentryException as jest.Mock).mockClear();
        global.fetch = jest.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
            const target = String(url);
            calls.push({ url: target, init });
            if (target.endsWith('/oauth/token')) {
                return Promise.resolve(new Response(JSON.stringify({ access_token: 'mgmt-token', expires_in: 3600 }), { status: tokenStatus }));
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
