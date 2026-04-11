import { PrismaService } from '@/shared/services/prisma.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthTokenService } from '../services/auth-token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
    const authUser = {
        id: 'user-1',
        email: 'a@b.com',
        roles: ['user'],
        provider: 'jwt' as const,
    };

    const createGuard = (authToken: Partial<AuthTokenService>, prisma: unknown) => new JwtAuthGuard(authToken as AuthTokenService, prisma as PrismaService);

    const createContext = (authorization?: string) => {
        const request = {
            headers: authorization ? { authorization } : {},
        };
        return {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        } as ExecutionContext;
    };

    it('throws when Authorization Bearer token is missing', async () => {
        const guard = createGuard({ extractBearerToken: () => null }, { user: { findFirst: jest.fn() } });
        await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('sets authUser when JWT resolves', async () => {
        const request: { headers: { authorization?: string }; authUser?: typeof authUser } = {
            headers: { authorization: 'Bearer valid.jwt' },
        };
        const context = {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        } as ExecutionContext;

        const findFirst = jest.fn().mockResolvedValue(null);
        const guard = createGuard(
            {
                extractBearerToken: () => 'valid.jwt',
                resolveAuthUser: jest.fn().mockResolvedValue(authUser),
            },
            { user: { findFirst } },
        );

        await guard.canActivate(context);

        expect(request.authUser).toEqual(authUser);
        expect(findFirst).toHaveBeenCalled();
    });
});
