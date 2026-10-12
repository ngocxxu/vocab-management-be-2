import { Prisma } from '@prisma/client';
import { AdminLanguageDto, LanguageDto, LanguageInput } from '../dto';
import { TLanguageUsage } from '../utils';

type LanguageEntity = ConstructorParameters<typeof LanguageDto>[0];

export class LanguageMapper {
    public toCreateInput(input: LanguageInput): Prisma.LanguageCreateInput {
        return { code: input.code, name: input.name };
    }

    public buildUpdateInput(data: Partial<LanguageInput>): Prisma.LanguageUpdateInput {
        return {
            ...(data.code !== undefined && { code: data.code }),
            ...(data.name !== undefined && { name: data.name }),
        };
    }

    public toResponse(entity: LanguageEntity): LanguageDto {
        return new LanguageDto(entity);
    }

    public toResponseList(entities: LanguageEntity[]): LanguageDto[] {
        return entities.map((e) => this.toResponse(e));
    }

    public toAdminResponse(entity: LanguageEntity, usage: TLanguageUsage): AdminLanguageDto {
        return {
            id: entity.id,
            code: entity.code,
            name: entity.name,
            vocabCount: usage.vocabCount,
            folderCount: usage.folderCount,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
}
