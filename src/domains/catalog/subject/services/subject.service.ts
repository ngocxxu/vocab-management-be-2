import { HttpStatus, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IResponse } from '@/shared';
import { PlanQuotaService } from '../../plan/services/plan-quota.service';
import { SubjectBadRequestException, SubjectNotFoundException } from '../exceptions';
import { SubjectMapper } from '../mappers';
import { ReorderSubjectInput, SubjectDto, SubjectInput } from '../dto';
import { CreateSubjectInput } from '../dto/create-subject.input';
import { SubjectRepository } from '../repositories';

@Injectable()
export class SubjectService {
    private readonly subjectMapper = new SubjectMapper();

    public constructor(
        private readonly subjectRepository: SubjectRepository,
        private readonly planQuotaService: PlanQuotaService,
    ) {}

    public async find(userId: string): Promise<IResponse<SubjectDto[]>> {
        const subjects = await this.subjectRepository.findByUserId(userId);

        return {
            items: this.subjectMapper.toResponseList(subjects),
            statusCode: HttpStatus.OK,
        };
    }

    public async findOne(id: string, userId?: string): Promise<SubjectDto> {
        const subject = await this.subjectRepository.findById(id, userId);

        if (!subject) {
            throw new SubjectNotFoundException(id);
        }

        return this.subjectMapper.toResponse(subject);
    }

    public async create(
        createSubjectData: CreateSubjectInput,
        userId: string,
        role?: UserRole,
    ): Promise<SubjectDto> {
        if (role !== undefined) {
            await this.planQuotaService.assertCreationQuota(userId, role, 'subject');
        }
        const { name } = createSubjectData;

        const lastSubject = await this.subjectRepository.findLastOrder();

        const newOrder = lastSubject ? lastSubject.order + 1 : 1;

        const subject = await this.subjectRepository.create({
            name,
            order: newOrder,
            userId,
        });

        return this.subjectMapper.toResponse(subject);
    }

    public async update(
        id: string,
        updateSubjectData: SubjectInput,
        userId?: string,
    ): Promise<SubjectDto> {
        if (!id) {
            throw new SubjectBadRequestException('Subject ID is required');
        }

        const existingSubject = await this.subjectRepository.findById(id, userId);

        if (!existingSubject) {
            throw new SubjectNotFoundException(id);
        }

        const subject = await this.subjectRepository.update(
            id,
            this.subjectMapper.toUpdatePayload(updateSubjectData),
        );

        return this.subjectMapper.toResponse(subject);
    }

    public async reorder(input: ReorderSubjectInput, userId: string): Promise<SubjectDto[]> {
        const { subjectIds } = input;

        const orderMap = new Map(subjectIds.map((item) => [item.id, item.order]));

        const subjects = await this.subjectRepository.findByIds(
            subjectIds.map((subject) => subject.id),
            userId,
        );

        await this.subjectRepository.updateManyInTransaction(
            subjects.map((subject) => ({
                id: subject.id,
                data: { order: orderMap.get(subject.id) },
            })),
        );

        await this.subjectRepository.clearUserCache(userId);

        const sortedSubjects = await this.subjectRepository.findByIdsOrdered(
            subjectIds.map((subject) => subject.id),
            userId,
        );

        return this.subjectMapper.toResponseList(sortedSubjects);
    }

    public async clearUserCache(userId: string): Promise<void> {
        await this.subjectRepository.clearUserCache(userId);
    }

    public async delete(id: string, userId?: string): Promise<SubjectDto> {
        await this.findOne(id, userId);
        const subject = await this.subjectRepository.delete(id, userId);

        return this.subjectMapper.toResponse(subject);
    }
}
