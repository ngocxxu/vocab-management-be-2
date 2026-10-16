import type { AuthUser } from '../interfaces/auth-user.interface';
import { UserIdentityRepository, UserRepository } from '@/domains/identity/user/repositories';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';

import { IdentityUnauthorizedException } from '../exceptions';

@Injectable()
export class AuthIdentityService {
    public constructor(
        private readonly userRepository: UserRepository,
        private readonly userIdentityRepository: UserIdentityRepository,
    ) {}

    /**
     * Maps a verified token to the internal User.
     * Auth0 identities resolve only through issuer + subject; email is never used to find or link a user,
     * and an unmapped identity is rejected. Supabase users resolve by `supabaseUserId` and may be null (not yet synced).
     * A deactivated user is rejected here so HTTP and WebSocket authentication share the same rule.
     */
    public async resolveLocalUser(authUser: AuthUser): Promise<User | null> {
        const user = await this.findLocalUser(authUser);
        if (user && !user.isActive) {
            throw new UnauthorizedException('This account has been deleted');
        }
        return user;
    }

    private async findLocalUser(authUser: AuthUser): Promise<User | null> {
        if (authUser.provider !== 'auth0') {
            return this.userRepository.findBySupabaseUserId(authUser.id);
        }
        if (!authUser.issuer || !authUser.subject) {
            throw new IdentityUnauthorizedException();
        }
        const user = await this.userIdentityRepository.findUserByIdentity(authUser.issuer, authUser.subject);
        if (!user) {
            throw new IdentityUnauthorizedException();
        }
        return user;
    }
}
