import type { AuthUser } from '../interfaces/auth-user.interface';
import type { AuthIdentityService } from '../services/auth-identity.service';
import { User } from '@prisma/client';
import { Request } from 'express';

type RequestWithAuth = Request & { authUser?: AuthUser; currentUser?: User };

export async function bindAuthUserToRequest(identityService: AuthIdentityService, request: RequestWithAuth, authUser: AuthUser): Promise<void> {
    const dbUser = await identityService.resolveLocalUser(authUser);

    // From here on `authUser.id` is the internal users.id, so throttling and ownership checks never see the provider's id.
    request.authUser = dbUser ? { ...authUser, id: dbUser.id } : authUser;
    request.currentUser = dbUser ?? undefined;
}
