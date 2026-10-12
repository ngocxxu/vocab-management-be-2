import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthTokenService } from './auth-token.service';

const JWT_SECRET = 'test-secret';
const JWT_ISSUER = 'test-issuer';

describe('AuthTokenService', () => {
    const config = {
        getOrThrow: (key: string) => (key === 'jwt.secret' ? JWT_SECRET : JWT_ISSUER),
    } as unknown as ConfigService;

    const createService = (supabaseUser: unknown) => {
        const getUser = jest.fn().mockResolvedValue({ data: { user: supabaseUser }, error: null });
        const supabaseAuth = { getAnonClient: () => ({ auth: { getUser } }) } as unknown as SupabaseAuthProvider;
        return new AuthTokenService(config, supabaseAuth);
    };

    it('ignores role claims in Supabase user metadata', async () => {
        const service = createService({
            id: 'supabase-user-1',
            email: 'user@example.com',
            user_metadata: { roles: ['ADMIN'] },
            app_metadata: { roles: ['ADMIN'] },
        });

        const authUser = await service.resolveAuthUser('supabase-token', 'supabase');

        expect(authUser.provider).toBe('supabase');
        expect(authUser.roles).toEqual([]);
    });

    it('keeps role claims from the application JWT', async () => {
        const service = createService(undefined);
        const token = jwt.sign({ sub: 'user-1', roles: ['ADMIN'] }, JWT_SECRET, { algorithm: 'HS256', issuer: JWT_ISSUER });

        const authUser = await service.resolveAuthUser(token, 'jwt');

        expect(authUser.roles).toEqual(['ADMIN']);
    });
});
