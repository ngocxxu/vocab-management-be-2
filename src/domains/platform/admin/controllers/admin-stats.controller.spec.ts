import { RolesGuard } from '@/shared';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AdminStatsController } from './admin-stats.controller';

// Runs the real RolesGuard against the real controller metadata, so the 403 comes from the wiring, not a mock.
describe('AdminStatsController access', () => {
    const guard = new RolesGuard(new Reflector());

    // @Roles is set on the class, so the guard never reads handler metadata and any function works here.
    const createContext = (role: UserRole): ExecutionContext =>
        ({
            getClass: () => AdminStatsController,
            getHandler: () => () => undefined,
            switchToHttp: () => ({
                getRequest: () => ({ authUser: { id: 'u1' }, currentUser: { id: 'u1', role } }),
            }),
        }) as unknown as ExecutionContext;

    it('lets an admin through', () => {
        expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
    });

    it('returns 403 for a member', () => {
        expect(() => guard.canActivate(createContext(UserRole.MEMBER))).toThrow(ForbiddenException);
    });

    it('returns 403 for a guest', () => {
        expect(() => guard.canActivate(createContext(UserRole.GUEST))).toThrow(ForbiddenException);
    });
});
