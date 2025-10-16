import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { PrismaErrorHandler } from '../handler/error.handler';
import { LoggerService, PrismaService } from '../provider';
import { CookieUtil } from '../util/cookie.util';
import { RequestWithUser } from '../util/type.util';

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly supabase: SupabaseClient;
    public constructor(
        private readonly reflector: Reflector,
        private readonly logger: LoggerService,
        private readonly prismaService: PrismaService,
    ) {
        this.supabase = createClient(
            process.env.SUPABASE_URL ?? '',
            process.env.SUPABASE_KEY ?? '',
        );
    }

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithUser & Request>();

        // Try to get token from cookies first, then from Authorization header
        let token = this.extractTokenFromCookies(request.headers.cookie);

        if (!token) {
            // Fallback to Authorization header
            token = this.extractTokenFromHeader(request.headers.authorization);
        }

        if (!token) {
            return false;
        }

        try {
            // Verify token with Supabase
            const {
                data: { user },
                error,
            } = await this.supabase.auth.getUser(token);

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
        } catch (err) {
            if (err instanceof PrismaClientKnownRequestError) {
                PrismaErrorHandler.handle(err);
            }
            this.logger.error(err instanceof Error ? err.message : String(err));
            throw new UnauthorizedException('Token verification failed');
        }
    }

    private extractTokenFromHeader(header: string | undefined): string | null {
        if (!header?.startsWith('Bearer ')) {
            return null;
        }
        const [, token] = header.split(' ');
        return token || null;
    }

    private extractTokenFromCookies(cookieHeader: string | undefined): string | null {
        if (!cookieHeader) {
            return null;
        }

        const cookies = this.parseCookies(cookieHeader);
        return cookies[CookieUtil.getAccessTokenCookieName()] || null;
    }

    private parseCookies(cookieHeader: string): Record<string, string> {
        return Object.fromEntries(
            cookieHeader.split(';').map(cookie => {
                const [key, ...v] = cookie.trim().split('=');
                return [key, decodeURIComponent(v.join('='))];
            })
        );
    }
}
