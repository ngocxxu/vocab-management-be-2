import { Prisma } from '@prisma/client';
import { ApiKeyDto, CreateApiKeyInput, CreateApiKeyResponseDto } from '../dto';
import { ApiKeyWithFolder } from '../repositories';
import { GeneratedApiKey } from '../utils';

export class ApiKeyMapper {
    public toCreateInput(input: CreateApiKeyInput, userId: string, generated: GeneratedApiKey): Prisma.ApiKeyCreateInput {
        return {
            name: input.name,
            scopes: input.scopes,
            keyHash: generated.keyHash,
            keyPrefix: generated.keyPrefix,
            user: { connect: { id: userId } },
            ...(input.languageFolderId && { languageFolder: { connect: { id: input.languageFolderId } } }),
        };
    }

    public toResponse(entity: ApiKeyWithFolder): ApiKeyDto {
        return new ApiKeyDto(entity);
    }

    public toResponseList(entities: ApiKeyWithFolder[]): ApiKeyDto[] {
        return entities.map((entity) => this.toResponse(entity));
    }

    public toCreateResponse(entity: ApiKeyWithFolder, rawKey: string): CreateApiKeyResponseDto {
        return new CreateApiKeyResponseDto(entity, rawKey);
    }
}
