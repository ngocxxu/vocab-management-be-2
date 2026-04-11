import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
    ConfigBadRequestException,
    SystemConfigNotFoundException,
    UserConfigNotFoundException,
} from '../exceptions';
import { ConfigDto } from '../dto';
import { ConfigRepository } from '../repositories';

@Injectable()
export class ConfigService {
    public constructor(private readonly configRepository: ConfigRepository) {}

    public async getSystemConfig(key: string): Promise<ConfigDto> {
        if (!key || key.trim().length === 0) {
            throw new ConfigBadRequestException('Config key is required');
        }

        const config = await this.configRepository.findSystemConfig(key);

        if (!config) {
            throw new SystemConfigNotFoundException(key);
        }

        return new ConfigDto(config);
    }

    public async getUserConfig(userId: string, key: string): Promise<ConfigDto> {
        if (!userId) {
            throw new ConfigBadRequestException('User ID is required');
        }

        if (!key || key.trim().length === 0) {
            throw new ConfigBadRequestException('Config key is required');
        }

        const config = await this.configRepository.findUserConfig(userId, key);

        if (!config) {
            throw new UserConfigNotFoundException(key);
        }

        return new ConfigDto(config);
    }

    public async getConfig(userId: string | null, key: string): Promise<unknown> {
        const config = await this.configRepository.findConfig(userId, key);

        if (config) {
            return config.value;
        }

        if (key === 'ai.model') {
            return null;
        }

        return null;
    }

    public async setSystemConfig(key: string, value: Prisma.InputJsonValue): Promise<ConfigDto> {
        if (!key || key.trim().length === 0) {
            throw new ConfigBadRequestException('Config key is required');
        }

        if (value === null || value === undefined) {
            throw new ConfigBadRequestException('Config value is required');
        }

        const saved = await this.configRepository.upsertSystemConfig(key, value);
        return new ConfigDto(saved);
    }

    public async setUserConfig(
        userId: string,
        key: string,
        value: Prisma.InputJsonValue,
    ): Promise<ConfigDto> {
        if (!userId) {
            throw new ConfigBadRequestException('User ID is required');
        }

        if (!key || key.trim().length === 0) {
            throw new ConfigBadRequestException('Config key is required');
        }

        if (value === null || value === undefined) {
            throw new ConfigBadRequestException('Config value is required');
        }

        const config = await this.configRepository.upsertUserConfig(userId, key, value);

        return new ConfigDto(config);
    }

    public async deleteSystemConfig(key: string): Promise<ConfigDto> {
        const config = await this.configRepository.findSystemConfigForUpdate(key);

        if (!config) {
            throw new SystemConfigNotFoundException(key);
        }

        const deletedConfig = await this.configRepository.deleteConfig(config.id);

        return new ConfigDto(deletedConfig);
    }

    public async deleteUserConfig(userId: string, key: string): Promise<ConfigDto> {
        const config = await this.configRepository.findUserConfigForUpdate(userId, key);

        if (!config) {
            throw new UserConfigNotFoundException(key);
        }

        const deletedConfig = await this.configRepository.deleteConfig(config.id);

        return new ConfigDto(deletedConfig);
    }
}
