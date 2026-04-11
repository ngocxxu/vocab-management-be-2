import { Prisma } from '@prisma/client';
import { LanguageDto, LanguageInput } from '../models';

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
}
