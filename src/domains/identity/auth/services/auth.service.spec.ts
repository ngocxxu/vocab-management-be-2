import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { LoggerService } from '@/shared/services/logger.service';
import { UserRole } from '@prisma/client';
import { UserRepository } from '../../user/repositories';
import { SignUpInput } from '../dto';
import { AuthService } from './auth.service';

const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XskL0d3WHnaKVNdJgUo8';

describe('AuthService role assignment', () => {
    const now = new Date();
    const createdUser = (supabaseUserId: string, email: string) => ({
        id: 'db-user-1',
        email,
        firstName: '',
        lastName: '',
        phone: null,
        avatar: null,
        role: UserRole.GUEST,
        isActive: true,
        emailConfirmed: false,
        supabaseUserId,
        chatLastReadAt: null,
        createdAt: now,
        updatedAt: now,
    });

    const createService = (overrides: { anon?: unknown; userClient?: unknown }) => {
        const userRepository = {
            findByEmail: jest.fn().mockResolvedValue(null),
            findBySupabaseUserId: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((data: { email: string; supabaseUserId: string }) => createdUser(data.supabaseUserId, data.email)),
            update: jest.fn(),
        };
        const supabaseAuth = {
            getAnonClient: () => overrides.anon,
            getServiceRoleClient: () => ({ auth: { admin: { deleteUser: jest.fn() } } }),
            createClientWithAccessToken: () => overrides.userClient,
        };
        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const service = new AuthService(userRepository as unknown as UserRepository, supabaseAuth as unknown as SupabaseAuthProvider, logger as unknown as LoggerService);
        return { service, userRepository };
    };

    it('creates a GUEST on sign-up even when the request asks for ADMIN', async () => {
        const signUp = jest.fn().mockResolvedValue({
            data: { user: { id: 'sb-1', email: 'user@example.com' }, session: null },
            error: null,
        });
        const { service, userRepository } = createService({ anon: { auth: { signUp } } });

        await service.signUp({ email: 'user@example.com', password: 'secret123', role: UserRole.ADMIN } as SignUpInput);

        expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.GUEST }));
        expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ data: expect.objectContaining({ role: UserRole.GUEST }) }) }));
    });

    it('creates a GUEST on first OAuth sign-in even when the provider metadata says ADMIN', async () => {
        const getUser = jest.fn().mockResolvedValue({
            data: {
                user: {
                    id: 'sb-2',
                    email: 'oauth@example.com',
                    user_metadata: { role: 'ADMIN', first_name: 'O', last_name: 'Auth' },
                },
            },
            error: null,
        });
        const setSession = jest.fn().mockResolvedValue({
            data: {
                session: { access_token: SAMPLE_JWT, refresh_token: 'refresh', expires_in: 3600, expires_at: 1900000000, token_type: 'bearer' },
            },
            error: null,
        });
        const { service, userRepository } = createService({ userClient: { auth: { getUser, setSession } } });

        await service.syncOAuthUser(SAMPLE_JWT, 'refresh');

        expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.GUEST }));
    });
});
