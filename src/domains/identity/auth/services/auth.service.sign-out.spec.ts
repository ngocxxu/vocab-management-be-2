import { AuthError } from '@supabase/supabase-js';

import { AuthService } from './auth.service';

function buildService(adminResult: { error: AuthError | null } = { error: null }) {
    const adminSignOut = jest.fn().mockResolvedValue(adminResult);
    const sharedClientSignOut = jest.fn().mockResolvedValue({ error: null });
    const supabaseAuth = {
        getAnonClient: () => ({ auth: { signOut: sharedClientSignOut } }),
        getServiceRoleClient: () => ({ auth: { admin: { signOut: adminSignOut } } }),
    };

    const service = new AuthService({} as never, supabaseAuth as never, {} as never);

    return { service, adminSignOut, sharedClientSignOut };
}

describe('AuthService.signOut', () => {
    it("revokes the caller's own session through the admin client", async () => {
        const { service, adminSignOut } = buildService();

        const result = await service.signOut('caller-access-token');

        expect(adminSignOut).toHaveBeenCalledTimes(1);
        expect(adminSignOut).toHaveBeenCalledWith('caller-access-token', 'local');
        expect(result).toEqual({ message: 'User signed out successfully' });
    });

    it('never signs out through the shared anon client, whose session belongs to whoever signed in last', async () => {
        const { service, sharedClientSignOut } = buildService();

        await service.signOut('caller-access-token');

        expect(sharedClientSignOut).not.toHaveBeenCalled();
    });

    it('raises an auth error when Supabase rejects the sign out', async () => {
        const { service } = buildService({ error: new AuthError('boom', 500) });

        await expect(service.signOut('caller-access-token')).rejects.toThrow();
    });
});
