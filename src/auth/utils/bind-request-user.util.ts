import { User } from '@prisma/client';
import { Request } from 'express';

import { PrismaService } from '@/shared/services/prisma.service';

import type { AuthUser } from '../interfaces/auth-user.interface';

export async function bindAuthUserToRequest(
    prisma: PrismaService,
    request: Request & { authUser?: AuthUser; currentUser?: User },
    authUser: AuthUser,
): Promise<void> {
    request.authUser = authUser;
    const dbUser = await prisma.user.findFirst({
        where: {
            OR: [{ id: authUser.id }, { supabaseUserId: authUser.id }],
        },
    });
    request.currentUser = dbUser ?? undefined;
}
