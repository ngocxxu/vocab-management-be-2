import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { BaseRepository } from '../../../database';
import { PrismaService } from '../../shared';

@Injectable()
export class UserRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findAll(): Promise<User[]> {
        return this.prisma.user.findMany();
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

    public async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data,
        });
    }

    public async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        return this.prisma.user.update({
            where: { id },
            data,
        });
    }

    public async delete(id: string): Promise<User> {
        return this.prisma.user.delete({
            where: { id },
        });
    }
}

