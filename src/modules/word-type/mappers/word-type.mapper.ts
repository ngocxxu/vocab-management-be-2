import { Prisma } from '@prisma/client';
import { WordTypeDto, WordTypeInput } from '../models';

type WordTypeEntity = ConstructorParameters<typeof WordTypeDto>[0];

export class WordTypeMapper {
    public toCreateInput(input: WordTypeInput): Prisma.WordTypeCreateInput {
        return { name: input.name, description: input.description };
    }

    public buildUpdateInput(data: Partial<WordTypeInput>): Prisma.WordTypeUpdateInput {
        return {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
        };
    }

    public toResponse(entity: WordTypeEntity): WordTypeDto {
        return new WordTypeDto(entity);
    }

    public toResponseList(entities: WordTypeEntity[]): WordTypeDto[] {
        return entities.map((e) => this.toResponse(e));
    }
}
