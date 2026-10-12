import { LanguageController } from '@/domains/catalog/language/controllers/language.controller';
import { WordTypeController } from '@/domains/catalog/word-type/controllers/word-type.controller';
import { UserController } from '@/domains/identity/user/controllers/user.controller';
import { NotificationController } from '@/domains/notification/controllers/notification.controller';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Roles } from '../decorators/roles.decorator';

describe('Admin-only routes', () => {
    const reflector = new Reflector();
    const rolesOf = (controller: { prototype: object }, method: string): string[] | undefined =>
        reflector.get(Roles, (controller.prototype as Record<string, unknown>)[method] as (...args: unknown[]) => unknown);

    it.each([
        [UserController, 'find'],
        [UserController, 'findOne'],
        [NotificationController, 'find'],
        [NotificationController, 'create'],
        [NotificationController, 'update'],
        [NotificationController, 'delete'],
        [LanguageController, 'create'],
        [LanguageController, 'update'],
        [LanguageController, 'delete'],
        [WordTypeController, 'create'],
        [WordTypeController, 'update'],
        [WordTypeController, 'delete'],
    ])('%p.%s is restricted to ADMIN', (controller, method) => {
        expect(rolesOf(controller, method)).toEqual([UserRole.ADMIN]);
    });
});
