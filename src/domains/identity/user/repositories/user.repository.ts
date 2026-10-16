import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { getOrderBy } from '@/shared/utils/pagination.util';
import { Injectable } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';

export type UserTransaction = Prisma.TransactionClient;

/** Filter, sort and page window for `findPage`. Search matches email, first name or last name. */
export type UserPageFilter = {
    search?: string;
    role?: UserRole;
    isActive?: boolean;
    sortBy: 'createdAt' | 'email';
    sortOrder: 'asc' | 'desc';
    skip: number;
    take: number;
};

function buildWhere(filter: UserPageFilter): Prisma.UserWhereInput {
    const search: Prisma.UserWhereInput = filter.search
        ? {
              OR: [
                  { email: { contains: filter.search, mode: 'insensitive' } },
                  { firstName: { contains: filter.search, mode: 'insensitive' } },
                  { lastName: { contains: filter.search, mode: 'insensitive' } },
              ],
          }
        : {};

    return {
        ...search,
        ...(filter.role !== undefined && { role: filter.role }),
        ...(filter.isActive !== undefined && { isActive: filter.isActive }),
    };
}

@Injectable()
export class UserRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findAll(): Promise<User[]> {
        return this.prisma.user.findMany();
    }

    /** One page of users plus the total for the same filter, read in parallel. */
    public async findPage(filter: UserPageFilter): Promise<[User[], number]> {
        const where = buildWhere(filter);
        const orderBy = getOrderBy(filter.sortBy, filter.sortOrder, 'createdAt') as Prisma.UserOrderByWithRelationInput;

        return Promise.all([this.prisma.user.findMany({ where, orderBy, skip: filter.skip, take: filter.take }), this.prisma.user.count({ where })]);
    }

    /** Active admins other than `excludeId`. Used to keep at least one active admin. */
    public async countActiveAdmins(excludeId: string, tx?: UserTransaction): Promise<number> {
        return this.client(tx).user.count({
            where: { role: UserRole.ADMIN, isActive: true, id: { not: excludeId } },
        });
    }

    public async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    public async findBySupabaseUserId(supabaseUserId: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { supabaseUserId },
        });
    }

    public async findByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }

    /** Emails are stored as typed (not lower-cased), so a collision check must ignore case to see every existing owner. */
    public async findByEmailIgnoreCase(email: string): Promise<User | null> {
        return this.prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
        });
    }

    public async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data,
        });
    }

    public async update(id: string, data: Prisma.UserUpdateInput, tx?: UserTransaction): Promise<User> {
        return this.client(tx).user.update({
            where: { id },
            data,
        });
    }

    public async delete(id: string, tx?: UserTransaction): Promise<User> {
        return this.client(tx).user.delete({
            where: { id },
        });
    }
}
