import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { IResponse } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { ReorderSubjectInput, SubjectDto, SubjectInput } from '../model';
import { CreateSubjectInput } from '../model/create-subject.input';
import { SubjectRepository } from '../repository';

@Injectable()
export class SubjectService {
    private readonly subjectErrorMapping = {
        P2002: 'Subject with this name already exists',
        P2025: {
            update: 'Subject not found',
            delete: 'Subject not found',
            findOne: 'Subject not found',
            create: 'Subject creation failed',
            find: 'Subject not found',
            reorder: 'Subject reordering failed',
        },
        P2003: 'Invalid subject data provided',
    };

    public constructor(private readonly subjectRepository: SubjectRepository) {}

    /**
     * Find all subjects in the database
     * @returns Promise<SubjectDto[]> Array of subject DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(userId: string): Promise<IResponse<SubjectDto[]>> {
        try {
            const subjects = await this.subjectRepository.findByUserId(userId);

            return {
                items: subjects.map((subject) => new SubjectDto(subject)),
                statusCode: HttpStatus.OK,
            };
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'find', this.subjectErrorMapping);
        }
    }

    /**
     * Find a single subject by ID
     * @param id - The subject ID to search for
     * @param userId - Optional user ID to filter by
     * @returns Promise<SubjectDto> The subject DTO
     * @throws NotFoundException when subject is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string, userId?: string): Promise<SubjectDto> {
        try {
            const subject = await this.subjectRepository.findById(id, userId);

            if (!subject) {
                throw new NotFoundException(`Subject with ID ${id} not found`);
            }

            return new SubjectDto(subject);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.subjectErrorMapping);
            throw error;
        }
    }

    /**
     * Create a new subject record
     * @param createSubjectData - The subject input data
     * @returns Promise<SubjectDto> The created subject DTO
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async create(
        createSubjectData: CreateSubjectInput,
        userId: string,
    ): Promise<SubjectDto> {
        try {
            const { name } = createSubjectData;

            const lastSubject = await this.subjectRepository.findLastOrder();

            const newOrder = lastSubject ? lastSubject.order + 1 : 1;

            const subject = await this.subjectRepository.create({
                name,
                order: newOrder,
                userId,
            });

            return new SubjectDto(subject);
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'create', this.subjectErrorMapping);
        }
    }

    /**
     * Update a subject record
     * @param id - The subject ID to update
     * @param updateSubjectData - Partial subject input data
     * @param userId - Optional user ID to filter by
     * @returns Promise<SubjectDto> The updated subject DTO
     * @throws NotFoundException when subject is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(
        id: string,
        updateSubjectData: SubjectInput,
        userId?: string,
    ): Promise<SubjectDto> {
        try {
            const existingSubject = await this.subjectRepository.findById(id, userId);

            if (!existingSubject) {
                throw new Error('Subject not found or unauthorized');
            }

            const subject = await this.subjectRepository.update(id, {
                name: updateSubjectData.name,
                order: updateSubjectData.order,
            });

            return new SubjectDto(subject);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.subjectErrorMapping);
        }
    }

    public async reorder(input: ReorderSubjectInput, userId: string): Promise<SubjectDto[]> {
        try {
            const { subjectIds } = input;

            const orderMap = new Map(subjectIds.map((item) => [item.id, item.order]));

            const subjects = await this.subjectRepository.findByIds(
                subjectIds.map((subject) => subject.id),
                userId,
            );

            await this.subjectRepository.updateMany(
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

            return sortedSubjects.map((subject) => new SubjectDto(subject));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'reorder', this.subjectErrorMapping);
            throw error;
        }
    }

    /**
     * Clear all subject cache for a user
     * @param userId - The user ID to clear cache for
     */
    public async clearUserCache(userId: string): Promise<void> {
        await this.subjectRepository.clearUserCache(userId);
    }

    /**
     * Delete a subject record
     * @param id - The subject ID to delete
     * @param userId - Optional user ID to filter by
     * @returns Promise<SubjectDto> The deleted subject DTO
     * @throws NotFoundException when subject is not found
     * @throws PrismaError when database operation fails or subject not found
     */
    public async delete(id: string, userId?: string): Promise<SubjectDto> {
        try {
            const subject = await this.subjectRepository.delete(id, userId);

            return new SubjectDto(subject);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'delete', this.subjectErrorMapping);
        }
    }
}
