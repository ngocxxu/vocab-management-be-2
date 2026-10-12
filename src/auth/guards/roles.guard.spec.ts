import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserRole } from '@prisma/client';
import { AuthUser } from '../interfaces/auth-user.interface';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
    const createGuard = (required: string[]) => {
        const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
        return new RolesGuard(reflector);
    };

    const createContext = (request: { authUser?: AuthUser; currentUser?: Partial<User> }): ExecutionContext =>
        ({
            getHandler: () => undefined,
            getClass: () => undefined,
            switchToHttp: () => ({ getRequest: () => request }),
        }) as unknown as ExecutionContext;

    it('uses the database role when the token carries no roles', () => {
        const guard = createGuard([UserRole.ADMIN]);
        const context = createContext({
            authUser: { id: 'user-1', email: 'user@example.com', roles: [], provider: 'supabase' },
            currentUser: { role: UserRole.ADMIN },
        });

        expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects a token that claims ADMIN when the database role is not ADMIN', () => {
        const guard = createGuard([UserRole.ADMIN]);
        const context = createContext({
            authUser: { id: 'user-1', email: 'user@example.com', roles: [UserRole.ADMIN], provider: 'jwt' },
            currentUser: { role: UserRole.GUEST },
        });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects a token that claims ADMIN when no database user is bound', () => {
        const guard = createGuard([UserRole.ADMIN]);
        const context = createContext({
            authUser: { id: 'user-1', email: 'user@example.com', roles: [UserRole.ADMIN], provider: 'jwt' },
        });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('rejects a token without roles when the database role is not allowed', () => {
        const guard = createGuard([UserRole.ADMIN]);
        const context = createContext({
            authUser: { id: 'user-1', email: 'user@example.com', roles: [], provider: 'supabase' },
            currentUser: { role: UserRole.GUEST },
        });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
});
