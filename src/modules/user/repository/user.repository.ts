import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../common';

@Injectable()
export class UserRepository {
    public constructor(private readonly prismaService: PrismaService) {}

    public async findAll(): Promise<User[]> {
        return this.prismaService.user.findMany();
    }

    public async findById(id: string): Promise<User | null> {
        return this.prismaService.user.findUnique({
            where: { id },
        });
    }

    public async findBySupabaseUserId(supabaseUserId: string): Promise<User | null> {
        return this.prismaService.user.findUnique({
            where: { supabaseUserId },
        });
    }

    public async findByEmail(email: string): Promise<User | null> {
        return this.prismaService.user.findUnique({
            where: { email },
        });
    }

    public async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prismaService.user.create({
            data,
        });
    }

    public async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        return this.prismaService.user.update({
            where: { id },
            data,
        });
    }

    public async delete(id: string): Promise<User> {
        return this.prismaService.user.delete({
            where: { id },
        });
    }
}

