import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { ConfigDto } from '../model';
import { ConfigRepository } from '../repository';

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

    public constructor(private readonly configRepository: ConfigRepository) {}

    public async getSystemConfig(key: string): Promise<ConfigDto> {
        if (!key || key.trim().length === 0) {
            throw new Error('Config key is required');
        }

        try {
            const config = await this.configRepository.findSystemConfig(key);

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
        if (!userId) {
            throw new Error('User ID is required');
        }

        if (!key || key.trim().length === 0) {
            throw new Error('Config key is required');
        }

        try {
            const config = await this.configRepository.findUserConfig(userId, key);

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
            const config = await this.configRepository.findConfig(userId, key);

            if (config) {
                return config.value;
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
        if (!key || key.trim().length === 0) {
            throw new Error('Config key is required');
        }

        if (value === null || value === undefined) {
            throw new Error('Config value is required');
        }

        try {
            return await this.configRepository.upsertSystemConfig(key, value);
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
        if (!userId) {
            throw new Error('User ID is required');
        }

        if (!key || key.trim().length === 0) {
            throw new Error('Config key is required');
        }

        if (value === null || value === undefined) {
            throw new Error('Config value is required');
        }

        try {
            const config = await this.configRepository.upsertUserConfig(userId, key, value);

            return new ConfigDto(config);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'setUserConfig', this.configErrorMapping);
            throw error;
        }
    }

    public async deleteSystemConfig(key: string): Promise<ConfigDto> {
        try {
            const config = await this.configRepository.findSystemConfigForUpdate(key);

            if (!config) {
                throw new NotFoundException(`System config with key "${key}" not found`);
            }

            const deletedConfig = await this.configRepository.deleteConfig(config.id);

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
            const config = await this.configRepository.findUserConfigForUpdate(userId, key);

            if (!config) {
                throw new NotFoundException(`User config with key "${key}" not found`);
            }

            const deletedConfig = await this.configRepository.deleteConfig(config.id);

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
