import type { UserDto } from '@/domains/identity/user/dto';
import { UserNotFoundInDatabaseException } from '@/domains/identity/user/exceptions';
import { UserRepository, UserTransaction } from '@/domains/identity/user/repositories';
import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { LoggerService } from '@/shared';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { getPagination } from '@/shared/utils/pagination.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { AdminUsersQueryDto } from '../dto/admin-users-query.dto';
import { UpdateAdminUserInput } from '../dto/update-admin-user.input';
import { AdminLastActiveAdminException, AdminUserDeleteFailedException, AdminUserInvalidChangeException, AdminUserSelfActionException } from '../exceptions';
import { toAdminUserDto, toAdminUserPage } from '../mappers';

type UserChange = { role?: UserRole; isActive?: boolean };

const isActiveAdmin = (user: User): boolean => user.role === UserRole.ADMIN && user.isActive;

@Injectable()
export class AdminUsersService {
    public constructor(
        private readonly userRepository: UserRepository,
        private readonly supabaseAuth: SupabaseAuthProvider,
        private readonly logger: LoggerService,
    ) {}

    private get supabase() {
        return this.supabaseAuth.getServiceRoleClient();
    }

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
     * Changes a user's role and/or active status. Nobody can change their own account here,
     * and the last active admin cannot be demoted or deactivated.
     */
    public async update(actor: User, id: string, input: UpdateAdminUserInput): Promise<UserDto> {
        const target = await this.findTarget(id);
        this.assertNotSelf(actor, target, 'change');
        if (input.role === undefined && input.isActive === undefined) {
            throw new AdminUserInvalidChangeException();
        }

        const change: UserChange = {
            ...(input.role !== undefined && { role: input.role }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
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
     * Deletes a user from Supabase, then from the database. A user with no Supabase account
     * loses only the database row. The last active admin cannot be deleted.
     */
    public async remove(actor: User, id: string): Promise<UserDto> {
        const target = await this.findTarget(id);
        this.assertNotSelf(actor, target, 'delete');
        // Refused before Supabase is touched, so a refused delete leaves the account intact.
        await this.assertKeepsAnotherAdmin(target);

        // Supabase goes first: if it fails, the local row stays and the admin can retry.
        await this.deleteSupabaseAccount(target.supabaseUserId);

        // Checked again inside the transaction: another admin may have been removed while Supabase was called.
        const removed = await this.userRepository.runSerializableWithRetry(async (tx) => {
            await this.assertKeepsAnotherAdmin(target, tx);
            return this.userRepository.delete(id, tx);
        });

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

    /** A user without a Supabase account has nothing to delete there. A 404 means it is already gone. */
    private async deleteSupabaseAccount(supabaseUserId: string | null): Promise<void> {
        if (!supabaseUserId) {
            return;
        }

        const { error } = await this.supabase.auth.admin.deleteUser(supabaseUserId);
        if (!error || error.status === HttpStatus.NOT_FOUND) {
            return;
        }

        throw new AdminUserDeleteFailedException(error.message);
    }
}
