import { captureSentryException } from '@/shared/utils/sentry.util';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthProvider } from './supabase-auth.provider';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

describe('SupabaseAuthProvider.deleteUserBestEffort', () => {
    const setup = (deleteUser: jest.Mock) => {
        const provider = new SupabaseAuthProvider({} as ConfigService);
        jest.spyOn(provider, 'getServiceRoleClient').mockReturnValue({ auth: { admin: { deleteUser } } } as never);
        return provider;
    };

    beforeEach(() => {
        (captureSentryException as jest.Mock).mockClear();
    });

    it('does nothing for a user without a Supabase account', async () => {
        const deleteUser = jest.fn();

        await setup(deleteUser).deleteUserBestEffort('u-1', null);

        expect(deleteUser).not.toHaveBeenCalled();
    });

    it('deletes the Supabase account', async () => {
        const deleteUser = jest.fn().mockResolvedValue({ data: {}, error: null });

        await setup(deleteUser).deleteUserBestEffort('u-1', 'sb-1');

        expect(deleteUser).toHaveBeenCalledWith('sb-1');
        expect(captureSentryException).not.toHaveBeenCalled();
    });

    it('treats a 404 as already deleted', async () => {
        const deleteUser = jest.fn().mockResolvedValue({ data: {}, error: { status: 404, message: 'User not found' } });

        await setup(deleteUser).deleteUserBestEffort('u-1', 'sb-1');

        expect(captureSentryException).not.toHaveBeenCalled();
    });

    it.each([
        ['an error answer', jest.fn().mockResolvedValue({ data: {}, error: { status: 500, message: 'upstream down' } })],
        ['a thrown error', jest.fn().mockRejectedValue(new Error('network down'))],
    ])('never throws on %s; it is captured with the user id', async (_name, deleteUser) => {
        await expect(setup(deleteUser).deleteUserBestEffort('u-1', 'sb-1')).resolves.toBeUndefined();

        expect(captureSentryException).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contexts: { supabaseCleanup: { userId: 'u-1' } } }));
    });

    it('gives up on a hung call instead of blocking the caller', async () => {
        jest.useFakeTimers();
        try {
            const deleteUser = jest.fn().mockReturnValue(new Promise(() => undefined));
            const pending = setup(deleteUser).deleteUserBestEffort('u-1', 'sb-1');

            await jest.advanceTimersByTimeAsync(6_000);
            await expect(pending).resolves.toBeUndefined();

            expect(captureSentryException).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});
