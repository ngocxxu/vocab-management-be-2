import { SubjectDto, SubjectInput } from '../models';

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
}
