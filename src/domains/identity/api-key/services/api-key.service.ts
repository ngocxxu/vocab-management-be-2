import { LanguageFolderNotFoundException } from '@/domains/catalog/language-folder/exceptions';
import { LanguageFolderRepository } from '@/domains/catalog/language-folder/repositories';
import { IResponse } from '@/shared/utils/type.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { ApiKeyDto, CreateApiKeyInput, CreateApiKeyResponseDto } from '../dto';
import { ApiKeyForbiddenException, ApiKeyNotFoundException, ApiKeyUnauthorizedException } from '../exceptions';
import { ApiKeyMapper } from '../mappers';
import { ApiKeyRepository, ApiKeyWithFolder } from '../repositories';
import { generateApiKey, hashApiKey } from '../utils';

@Injectable()
export class ApiKeyService {
    private readonly apiKeyMapper = new ApiKeyMapper();

    public constructor(
        private readonly apiKeyRepository: ApiKeyRepository,
        private readonly languageFolderRepository: LanguageFolderRepository,
    ) {}

    public async find(userId: string): Promise<IResponse<ApiKeyDto[]>> {
        const apiKeys = await this.apiKeyRepository.findAllByUserId(userId);

        return {
            items: this.apiKeyMapper.toResponseList(apiKeys),
            statusCode: HttpStatus.OK,
        };
    }

    public async create(input: CreateApiKeyInput, userId: string): Promise<CreateApiKeyResponseDto> {
        if (input.languageFolderId) {
            const folder = await this.languageFolderRepository.findById(input.languageFolderId, userId);
            if (!folder) {
                throw new LanguageFolderNotFoundException(input.languageFolderId);
            }
        }

        const generated = generateApiKey();
        const apiKey = await this.apiKeyRepository.create(this.apiKeyMapper.toCreateInput(input, userId, generated));

        return this.apiKeyMapper.toCreateResponse(apiKey, generated.rawKey);
    }

    public async delete(id: string, userId: string): Promise<ApiKeyDto> {
        const apiKey = await this.apiKeyRepository.findById(id, userId);
        if (!apiKey) {
            throw new ApiKeyNotFoundException(id);
        }

        await this.apiKeyRepository.delete(id);

        return this.apiKeyMapper.toResponse(apiKey);
    }

    /**
     * Authenticates a raw API key for use by ApiKeyGuard: hashes the key, loads the owning
     * key + folder, asserts the required scope, and records last-used time.
     */
    public async authenticate(rawKey: string, requiredScope: ApiKeyScope): Promise<ApiKeyWithFolder> {
        const apiKey = await this.apiKeyRepository.findByKeyHash(hashApiKey(rawKey));
        if (!apiKey) {
            throw new ApiKeyUnauthorizedException('Invalid API key');
        }

        if (!apiKey.scopes.includes(requiredScope)) {
            throw new ApiKeyForbiddenException(requiredScope);
        }

        await this.apiKeyRepository.touchLastUsedAt(apiKey.id);

        return apiKey;
    }
}
