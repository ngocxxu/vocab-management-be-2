import { Auth0ManagementService } from '@/domains/identity/auth0-management';
import type { UserDto } from '@/domains/identity/user/dto';
import { UserNotFoundInDatabaseException } from '@/domains/identity/user/exceptions';
import { UserIdentityRepository, UserRepository, UserTransaction } from '@/domains/identity/user/repositories';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { LoggerService } from '@/shared';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { getPagination } from '@/shared/utils/pagination.util';
import { Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { AdminUsersQueryDto } from '../dto/admin-users-query.dto';
import { UpdateAdminUserInput } from '../dto/update-admin-user.input';
import { AdminLastActiveAdminException, AdminUserInvalidChangeException, AdminUserSelfActionException } from '../exceptions';
import { toAdminUserDto, toAdminUserPage } from '../mappers';

type UserChange = { role?: UserRole; isActive?: boolean; mcpAccess?: boolean };

const isActiveAdmin = (user: User): boolean => user.role === UserRole.ADMIN && user.isActive;

@Injectable()
export class AdminUsersService {
    public constructor(
        private readonly userRepository: UserRepository,
        private readonly userIdentityRepository: UserIdentityRepository,
        private readonly supabaseAuth: SupabaseAuthProvider,
        private readonly auth0Management: Auth0ManagementService,
        private readonly logger: LoggerService,
    ) {}

    /** A page of users filtered by search, role and status, sorted and paged in the database. */
    public async list(query: AdminUsersQueryDto): Promise<PaginationDto<UserDto>> {
        const { page, pageSize, skip, take } = getPagination({ page: query.page, pageSize: query.pageSize });
        const [users, total] = await this.userRepository.findPage({
            search: query.q,
            role: query.role,
            isActive: query.isActive,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
            skip,
            take,
        });

        return toAdminUserPage(users, total, page, pageSize);
    }

    /**
     * Changes a user's role, active status and/or MCP access. Nobody can change their own account here,
     * and the last active admin cannot be demoted or deactivated.
     */
    public async update(actor: User, id: string, input: UpdateAdminUserInput): Promise<UserDto> {
        const target = await this.findTarget(id);
        this.assertNotSelf(actor, target, 'change');
        if (input.role === undefined && input.isActive === undefined && input.mcpAccess === undefined) {
            throw new AdminUserInvalidChangeException();
        }

        const change: UserChange = {
            ...(input.role !== undefined && { role: input.role }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
            ...(input.mcpAccess !== undefined && { mcpAccess: input.mcpAccess }),
        };
        const removesActiveAdmin = isActiveAdmin(target) && ((input.role !== undefined && input.role !== UserRole.ADMIN) || input.isActive === false);

        const updated = removesActiveAdmin
            ? await this.userRepository.runSerializableWithRetry(async (tx) => {
                  await this.assertAnotherActiveAdmin(target.id, tx);
                  return this.userRepository.update(id, change, tx);
              })
            : await this.userRepository.update(id, change);

        this.logger.info(`admin.user.update actor=${actor.id} target=${id} changes=${JSON.stringify(change)}`);

        return toAdminUserDto(updated);
    }

    /**
     * Permanently deletes a user from the database, then removes their Supabase and Auth0 accounts. The external
     * cleanup is best-effort and never blocks the delete: a leftover account is captured so it can be removed by
     * hand. The last active admin cannot be deleted.
     */
    public async remove(actor: User, id: string): Promise<UserDto> {
        const target = await this.findTarget(id);
        this.assertNotSelf(actor, target, 'delete');
        // Refused before anything is read or deleted, so a refused delete leaves the account intact.
        await this.assertKeepsAnotherAdmin(target);

        // Checked again inside the transaction: another admin may have been removed in the meantime.
        const { removed, identities } = await this.userRepository.runSerializableWithRetry(async (tx) => {
            await this.assertKeepsAnotherAdmin(target, tx);
            // Read in the same transaction as the delete: the Identity rows cascade away with the user, and a login
            // provisioned a moment earlier must not slip past the Auth0 cleanup.
            const found = await this.userIdentityRepository.findByUserId(target.id, tx);
            return { removed: await this.userRepository.delete(id, tx), identities: found };
        });

        // After the row is gone nothing external can block the delete; an outage only leaves an account to clean up.
        await Promise.all([this.supabaseAuth.deleteUserBestEffort(target.id, target.supabaseUserId), this.auth0Management.deleteIdentities(target.id, identities)]);

        this.logger.info(`admin.user.delete actor=${actor.id} target=${id} email=${target.email}`);

        return toAdminUserDto(removed);
    }

    private async findTarget(id: string): Promise<User> {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new UserNotFoundInDatabaseException();
        }
        return user;
    }

    private assertNotSelf(actor: User, target: User, action: 'change' | 'delete'): void {
        if (target.id === actor.id) {
            throw new AdminUserSelfActionException(action);
        }
    }

    /** Only removing an active admin can break the last-admin rule. Every other user passes straight through. */
    private async assertKeepsAnotherAdmin(target: User, tx?: UserTransaction): Promise<void> {
        if (isActiveAdmin(target)) {
            await this.assertAnotherActiveAdmin(target.id, tx);
        }
    }

    private async assertAnotherActiveAdmin(excludeId: string, tx?: UserTransaction): Promise<void> {
        const others = await this.userRepository.countActiveAdmins(excludeId, tx);
        if (others === 0) {
            throw new AdminLastActiveAdminException();
        }
    }
}
