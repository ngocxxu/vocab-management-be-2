import type { UserIdentityRepository, UserRepository } from '../repositories';
import type { Auth0ManagementService } from '@/domains/identity/auth0-management';
import type { SupabaseAuthProvider } from '@/domains/media/supabase';
import { User, UserRole } from '@prisma/client';
import { UserInput } from '../dto';
import { UserBadRequestException, UserNotFoundInDatabaseException } from '../exceptions';
import { UserService } from './user.service';

const IDENTITIES = [{ issuer: 'https://t.auth0.com/', subject: 'google-oauth2|1' }];

const makeUser = (overrides: Partial<User> = {}): User =>
    ({
        id: 'u-1',
        email: 'user@example.com',
        phone: null,
        firstName: 'Una',
        lastName: 'User',
        avatar: null,
        role: UserRole.MEMBER,
        isActive: true,
        supabaseUserId: 'sb-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }) as User;

const setup = () => {
    const deleteUser = jest.fn().mockResolvedValue(undefined);
    const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
    const client = { auth: { admin: { updateUserById } } };
    const userRepository = {
        findById: jest.fn().mockResolvedValue(makeUser()),
        update: jest.fn().mockImplementation(async (id: string, data: Partial<User>) => Promise.resolve(makeUser({ ...data, id }))),
        delete: jest.fn().mockResolvedValue(makeUser()),
    };
    const identities = { findByUserId: jest.fn().mockResolvedValue(IDENTITIES) };
    const auth0 = { deleteIdentities: jest.fn().mockResolvedValue(undefined) };
    const service = new UserService(
        userRepository as unknown as UserRepository,
        { getServiceRoleClient: () => client, deleteUserBestEffort: deleteUser } as unknown as SupabaseAuthProvider,
        identities as unknown as UserIdentityRepository,
        auth0 as unknown as Auth0ManagementService,
    );
    return { service, userRepository, identities, auth0, deleteUser, updateUserById };
};

describe('UserService.delete', () => {
    it('removes the database row first, then the Supabase and Auth0 accounts', async () => {
        const { service, userRepository, identities, auth0, deleteUser } = setup();

        await service.delete('u-1');

        expect(userRepository.delete).toHaveBeenCalledWith('u-1');
        expect(deleteUser).toHaveBeenCalledWith('u-1', 'sb-1');
        expect(auth0.deleteIdentities).toHaveBeenCalledWith('u-1', IDENTITIES);
        const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0] ?? Infinity;
        expect(order(identities.findByUserId)).toBeLessThan(order(userRepository.delete));
        expect(order(userRepository.delete)).toBeLessThan(order(deleteUser));
        expect(order(userRepository.delete)).toBeLessThan(order(auth0.deleteIdentities));
    });

    it('answers not found without touching any account', async () => {
        const { service, userRepository, auth0, deleteUser } = setup();
        userRepository.findById.mockResolvedValue(null);

        await expect(service.delete('u-missing')).rejects.toBeInstanceOf(UserNotFoundInDatabaseException);

        expect(deleteUser).not.toHaveBeenCalled();
        expect(auth0.deleteIdentities).not.toHaveBeenCalled();
    });
});

describe('UserService.update', () => {
    const input = (overrides: Partial<UserInput> = {}) => ({ id: 'u-1', ...overrides }) as UserInput;

    it('refuses a password change: credentials are managed by Auth0', async () => {
        const { service, updateUserById, userRepository } = setup();

        await expect(service.update(input({ password: 'new-secret' }))).rejects.toBeInstanceOf(UserBadRequestException);

        expect(updateUserById).not.toHaveBeenCalled();
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('refuses an email change: the email is managed by Auth0', async () => {
        const { service, updateUserById, userRepository } = setup();

        await expect(service.update(input({ email: 'someone.else@example.com' }))).rejects.toBeInstanceOf(UserBadRequestException);

        expect(updateUserById).not.toHaveBeenCalled();
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('still updates profile fields, and an unchanged email is fine, without calling Supabase', async () => {
        const { service, updateUserById, userRepository } = setup();

        await service.update(input({ email: 'user@example.com', firstName: 'Una-Marie' }));

        expect(userRepository.update).toHaveBeenCalledWith('u-1', expect.objectContaining({ firstName: 'Una-Marie' }));
        expect(updateUserById).not.toHaveBeenCalled();
    });
});
