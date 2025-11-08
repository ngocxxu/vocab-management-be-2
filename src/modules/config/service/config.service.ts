import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { ConfigDto } from '../model';

@Injectable()
export class ConfigService {
    private readonly configErrorMapping = {
        P2002: 'Config with this key already exists',
        P2025: {
            update: 'Config not found',
            delete: 'Config not found',
            findOne: 'Config not found',
            create: 'Config creation failed',
            find: 'Config not found',
        },
        P2003: 'Invalid config data provided',
    };

    public constructor(private readonly prismaService: PrismaService) {}

    public async getSystemConfig(key: string): Promise<ConfigDto> {
        try {
            const config = await this.prismaService.config.findFirst({
                where: {
                    scope: ConfigScope.SYSTEM,
                    userId: null,
                    key,
                    isActive: true,
                },
            });

            if (!config) {
                throw new NotFoundException(`System config with key "${key}" not found`);
            }

            return new ConfigDto(config);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'getSystemConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async getUserConfig(userId: string, key: string): Promise<ConfigDto> {
        try {
            const config = await this.prismaService.config.findFirst({
                where: {
                    scope: ConfigScope.USER,
                    userId,
                    key,
                    isActive: true,
                },
            });

            if (!config) {
                throw new NotFoundException(`User config with key "${key}" not found`);
            }

            return new ConfigDto(config);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'getUserConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async getConfig(userId: string | null, key: string): Promise<unknown> {
        try {
            if (userId) {
                const userConfig = await this.prismaService.config.findFirst({
                    where: {
                        scope: ConfigScope.USER,
                        userId,
                        key,
                        isActive: true,
                    },
                });

                if (userConfig) {
                    return userConfig.value;
                }
            }

            const systemConfig = await this.prismaService.config.findFirst({
                where: {
                    scope: ConfigScope.SYSTEM,
                    userId: null,
                    key,
                    isActive: true,
                },
            });

            if (systemConfig) {
                return systemConfig.value;
            }

            if (key === 'ai.model') {
                return null;
            }

            return null;
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'getConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async setSystemConfig(key: string, value: Prisma.InputJsonValue): Promise<ConfigDto> {
        try {
            const existing = await this.prismaService.config.findFirst({
                where: {
                    scope: ConfigScope.SYSTEM,
                    userId: null,
                    key,
                },
            });

            const config = existing
                ? await this.prismaService.config.update({
                      where: { id: existing.id },
                      data: {
                          value,
                          isActive: true,
                      },
                  })
                : await this.prismaService.config.create({
                      data: {
                          scope: ConfigScope.SYSTEM,
                          userId: null,
                          key,
                          value,
                          isActive: true,
                      },
                  });

            return new ConfigDto(config);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'setSystemConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async setUserConfig(
        userId: string,
        key: string,
        value: Prisma.InputJsonValue,
    ): Promise<ConfigDto> {
        try {
            const config = await this.prismaService.config.upsert({
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

            return new ConfigDto(config);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'setUserConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async deleteSystemConfig(key: string): Promise<ConfigDto> {
        try {
            const config = await this.prismaService.config.findFirst({
                where: {
                    scope: ConfigScope.SYSTEM,
                    userId: null,
                    key,
                },
            });

            if (!config) {
                throw new NotFoundException(`System config with key "${key}" not found`);
            }

            const deletedConfig = await this.prismaService.config.delete({
                where: {
                    id: config.id,
                },
            });

            return new ConfigDto(deletedConfig);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'deleteSystemConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async deleteUserConfig(userId: string, key: string): Promise<ConfigDto> {
        try {
            const config = await this.prismaService.config.findFirst({
                where: {
                    scope: ConfigScope.USER,
                    userId,
                    key,
                },
            });

            if (!config) {
                throw new NotFoundException(`User config with key "${key}" not found`);
            }

            const deletedConfig = await this.prismaService.config.delete({
                where: {
                    id: config.id,
                },
            });

            return new ConfigDto(deletedConfig);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'deleteUserConfig', this.configErrorMapping);
            throw error;
        }
    }
}
