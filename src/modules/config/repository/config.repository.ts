import { Injectable } from '@nestjs/common';
import { Config, ConfigScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../common';

@Injectable()
export class ConfigRepository {
    public constructor(private readonly prismaService: PrismaService) {}

    public async findSystemConfig(key: string): Promise<Config | null> {
        return this.prismaService.config.findFirst({
            where: {
                scope: ConfigScope.SYSTEM,
                userId: null,
                key,
                isActive: true,
            },
        });
    }

    public async findUserConfig(userId: string, key: string): Promise<Config | null> {
        return this.prismaService.config.findFirst({
            where: {
                scope: ConfigScope.USER,
                userId,
                key,
                isActive: true,
            },
        });
    }

    public async findConfig(userId: string | null, key: string): Promise<Config | null> {
        if (userId) {
            const userConfig = await this.findUserConfig(userId, key);
            if (userConfig) {
                return userConfig;
            }
        }

        return this.findSystemConfig(key);
    }

    public async findSystemConfigForUpdate(key: string): Promise<Config | null> {
        return this.prismaService.config.findFirst({
            where: {
                scope: ConfigScope.SYSTEM,
                userId: null,
                key,
            },
        });
    }

    public async findUserConfigForUpdate(userId: string, key: string): Promise<Config | null> {
        return this.prismaService.config.findFirst({
            where: {
                scope: ConfigScope.USER,
                userId,
                key,
            },
        });
    }

    public async createSystemConfig(key: string, value: Prisma.InputJsonValue): Promise<Config> {
        return this.prismaService.config.create({
            data: {
                scope: ConfigScope.SYSTEM,
                userId: null,
                key,
                value,
                isActive: true,
            },
        });
    }

    public async updateSystemConfig(id: string, value: Prisma.InputJsonValue): Promise<Config> {
        return this.prismaService.config.update({
            where: { id },
            data: {
                value,
                isActive: true,
            },
        });
    }

    public async upsertSystemConfig(key: string, value: Prisma.InputJsonValue): Promise<Config> {
        return this.prismaService.$transaction(async (tx) => {
            const existing = await tx.config.findFirst({
                where: {
                    scope: ConfigScope.SYSTEM,
                    userId: null,
                    key,
                },
            });

            if (existing) {
                return tx.config.update({
                    where: { id: existing.id },
                    data: {
                        value,
                        isActive: true,
                    },
                });
            }

            return tx.config.create({
                data: {
                    scope: ConfigScope.SYSTEM,
                    userId: null,
                    key,
                    value,
                    isActive: true,
                },
            });
        });
    }

    public async upsertUserConfig(
        userId: string,
        key: string,
        value: Prisma.InputJsonValue,
    ): Promise<Config> {
        return this.prismaService.config.upsert({
            where: {
                scope_userId_key: {
                    scope: ConfigScope.USER,
                    userId,
                    key,
                },
            },
            update: {
                value,
                isActive: true,
            },
            create: {
                scope: ConfigScope.USER,
                userId,
                key,
                value,
                isActive: true,
            },
        });
    }

    public async deleteConfig(id: string): Promise<Config> {
        return this.prismaService.config.delete({
            where: { id },
        });
    }
}
