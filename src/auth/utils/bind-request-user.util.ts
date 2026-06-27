import type { AuthUser } from '../interfaces/auth-user.interface';
import { PrismaService } from '@/shared/services/prisma.service';
import { User } from '@prisma/client';
import { Request } from 'express';

export async function bindAuthUserToRequest(prisma: PrismaService, request: Request & { authUser?: AuthUser; currentUser?: User }, authUser: AuthUser): Promise<void> {
    const dbUser = await prisma.user.findFirst({
        where: {
            OR: [{ id: authUser.id }, { supabaseUserId: authUser.id }],
        },
    });
    request.authUser = dbUser && authUser.provider === 'supabase' ? { ...authUser, id: dbUser.id } : authUser;
    request.currentUser = dbUser ?? undefined;
}
