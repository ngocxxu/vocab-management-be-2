import { RolesGuard } from '@/shared';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { NotificationController } from './notification.controller';

// Runs the real RolesGuard against the real handler metadata, so the 403 comes from the @Roles wiring, not a mock.
describe('NotificationController ADMIN-only broadcast routes', () => {
    const guard = new RolesGuard(new Reflector());

    // @Roles is set on each handler, so the guard reads the handler the route would call.
    const createContext = (handler: unknown, role: UserRole): ExecutionContext =>
        ({
            getClass: () => NotificationController,
            getHandler: () => handler,
            switchToHttp: () => ({
                getRequest: () => ({ authUser: { id: 'u1' }, currentUser: { id: 'u1', role } }),
            }),
        }) as unknown as ExecutionContext;

    const broadcastRoutes = [
        ['POST /notifications/broadcast', Reflect.get(NotificationController.prototype, 'broadcast')],
        ['GET /notifications/broadcasts', Reflect.get(NotificationController.prototype, 'findBroadcastHistory')],
    ] as const;

    it.each(broadcastRoutes)('%s lets an admin through', (_route, handler) => {
        expect(guard.canActivate(createContext(handler, UserRole.ADMIN))).toBe(true);
    });

    it.each(broadcastRoutes)('%s returns 403 for a member', (_route, handler) => {
        expect(() => guard.canActivate(createContext(handler, UserRole.MEMBER))).toThrow(ForbiddenException);
    });

    it.each(broadcastRoutes)('%s returns 403 for a guest', (_route, handler) => {
        expect(() => guard.canActivate(createContext(handler, UserRole.GUEST))).toThrow(ForbiddenException);
    });
});
