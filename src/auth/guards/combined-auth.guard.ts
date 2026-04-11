import type { AuthUser } from '../interfaces/auth-user.interface';
import { PrismaService } from '@/shared/services/prisma.service';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { Request } from 'express';

import { AuthTokenService } from '../services/auth-token.service';
import { bindAuthUserToRequest } from '../utils/bind-request-user.util';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
    public constructor(
        private readonly authTokenService: AuthTokenService,
        private readonly prisma: PrismaService,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request & { authUser?: AuthUser; currentUser?: User }>();
        const token = this.authTokenService.extractBearerToken(request);
        if (!token) {
            throw new UnauthorizedException('No authentication token provided');
        }
        const authUser = await this.authTokenService.resolveAuthUser(token, 'combined');
        await bindAuthUserToRequest(this.prisma, request, authUser);
        return true;
    }
}
