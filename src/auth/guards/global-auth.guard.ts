import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { Request } from 'express';

import { PrismaService } from '@/shared/services/prisma.service';

import { AUTH_STRATEGY_KEY, AuthStrategyValue } from '../decorators/auth-strategy.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../interfaces/auth-user.interface';
import { AuthTokenService } from '../services/auth-token.service';
import { bindAuthUserToRequest } from '../utils/bind-request-user.util';

@Injectable()
export class GlobalAuthGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly authTokenService: AuthTokenService,
        private readonly prisma: PrismaService,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<
            Request & { authUser?: AuthUser; currentUser?: User }
        >();

        if (request.method === 'OPTIONS') {
            return true;
        }

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const strategy =
            this.reflector.getAllAndOverride<AuthStrategyValue>(AUTH_STRATEGY_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) ?? 'combined';

        const token = this.authTokenService.extractBearerToken(request);
        if (!token) {
            throw new UnauthorizedException('No authentication token provided');
        }

        const authUser = await this.authTokenService.resolveAuthUser(token, strategy);
        await bindAuthUserToRequest(this.prisma, request, authUser);

        return true;
    }
}
