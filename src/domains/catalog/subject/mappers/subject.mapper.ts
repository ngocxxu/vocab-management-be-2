import { SubjectDto, SubjectInput, SubjectWithCountDto } from '../dto';

type SubjectEntity = ConstructorParameters<typeof SubjectDto>[0];

export class SubjectMapper {
    public toUpdatePayload(input: SubjectInput): { name: string; order: number } {
        return { name: input.name, order: input.order };
    }

    public toResponse(entity: SubjectEntity): SubjectDto {
        return new SubjectDto(entity);
    }

    public toResponseList(entities: SubjectEntity[]): SubjectDto[] {
        return entities.map((e) => this.toResponse(e));
    }

    public toResponseWithCount(entity: SubjectEntity, vocabCount: number): SubjectWithCountDto {
        return new SubjectWithCountDto(entity, vocabCount);
    }

    public toResponseListWithCount(entities: SubjectEntity[], countsBySubjectId: Map<string, number>): SubjectWithCountDto[] {
        return entities.map((e) => this.toResponseWithCount(e, countsBySubjectId.get(e.id) ?? 0));
    }
}
