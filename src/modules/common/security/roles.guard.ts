import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../decorator/roles.decorator';
import { RequestWithUser } from '../util/type.util';

@Injectable()
export class RolesGuard implements CanActivate {
    public constructor(private readonly reflector: Reflector) {}

    public canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.get(Roles, context.getHandler());
        if (!roles) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithUser>();

        if (!request.user) {
            throw new UnauthorizedException('User not authenticated');
        }

        if (!request.user.user_metadata?.role) {
            throw new ForbiddenException('User has no role assigned');
        }

        const user = request.user;
        const hasRole = roles.includes(user.user_metadata.role as string);

        if (!hasRole) {
            throw new ForbiddenException(
                `Access denied. Required roles: ${roles.join(', ')}, but user has: ${
                    user.user_metadata.role
                }`,
            );
        }

        return true;
    }
}
