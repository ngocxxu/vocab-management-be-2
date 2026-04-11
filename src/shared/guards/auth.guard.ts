import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { LoggerService } from '../services/logger.service';
import { PrismaService } from '../services/prisma.service';
import { RequestWithUser } from '../utils/type.util';

@Injectable()
export class AuthGuard implements CanActivate {
    public constructor(
        private readonly reflector: Reflector,
        private readonly logger: LoggerService,
        private readonly prismaService: PrismaService,
        private readonly supabaseAuth: SupabaseAuthProvider,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithUser & Request>();

        if (request.method === 'OPTIONS') {
            return true;
        }

        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
        if (isPublic) {
            return true;
        }

        const token = this.extractTokenFromHeader(request.headers.authorization);

        if (!token) {
            this.logger.warn('No authentication token provided');
            throw new UnauthorizedException('No authentication token provided');
        }

        const {
            data: { user },
            error,
        } = await this.supabaseAuth.getAnonClient().auth.getUser(token);

        if (error || !user) {
            throw new UnauthorizedException('Invalid or expired token');
        }

        const currentUser = await this.prismaService.user.findUnique({
            where: {
                supabaseUserId: user.id ?? '',
            },
        });

        request.user = user;
        request.currentUser = currentUser as User;
        return true;
    }

    private extractTokenFromHeader(header: string | undefined): string | null {
        if (!header?.startsWith('Bearer ')) {
            return null;
        }
        const [, token] = header.split(' ');
        return token || null;
    }
}
