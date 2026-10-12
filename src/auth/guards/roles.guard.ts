import type { AuthUser } from '../interfaces/auth-user.interface';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { Request } from 'express';

import { Roles } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    public constructor(private readonly reflector: Reflector) {}

    public canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(Roles, [context.getHandler(), context.getClass()]);
        if (!requiredRoles?.length) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request & { authUser?: AuthUser; currentUser?: User }>();
        const authUser = request.authUser;
        if (!authUser) {
            throw new UnauthorizedException('User not authenticated');
        }

        // The database role is the single source of truth; token role claims are never trusted.
        const databaseRole = request.currentUser?.role;
        const hasRole = databaseRole !== undefined && requiredRoles.includes(databaseRole);
        if (!hasRole) {
            throw new ForbiddenException(`Access denied. Required one of roles: ${requiredRoles.join(', ')}`);
        }

        return true;
    }
}
