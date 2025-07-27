import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { PrismaErrorHandler } from '../handler/error.handler';
import { LoggerService, PrismaService } from '../provider';
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

        const request = context.switchToHttp().getRequest<RequestWithUser>();
        const header = request.headers.authorization;

        if (!header) {
            return false;
        }

        const token = this.extractTokenFromHeader(header);

        if (!token) {
            throw new UnauthorizedException('Token not found');
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
    private extractTokenFromHeader(header: string): string | null {
        if (!header?.startsWith('Bearer ')) {
            return null;
        }
        const [, token] = header.split(' ');
        return token || null;
    }
}
