import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Subject } from '@prisma/client';
import { IResponse, PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { ReorderSubjectInput, SubjectDto, SubjectInput } from '../model';
import { CreateSubjectInput } from '../model/create-subject.input';

@Injectable()
export class SubjectService {
    // Custom error mapping cho Subject
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

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * Find all subjects in the database
     * @returns Promise<SubjectDto[]> Array of subject DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(userId: string): Promise<IResponse<SubjectDto[]>> {
        try {
            const cached = await this.redisService.jsonGetWithPrefix<Subject[]>(
                RedisPrefix.SUBJECT,
                `userId:${userId}`,
            );
            if (cached) {
                return {
                    items: cached.map((subject) => new SubjectDto(subject)),
                    statusCode: HttpStatus.OK,
                };
            }

            const subjects = await this.prismaService.subject.findMany({
                orderBy: {
                    order: 'asc',
                },
                where: {
                    userId,
                },
            });

            await this.redisService.jsonSetWithPrefix(RedisPrefix.SUBJECT, 'all', subjects);

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
            // Try to get from cache first using hash
            const cached = await this.redisService.getObjectWithPrefix<Subject>(
                RedisPrefix.SUBJECT,
                `id:${id}`,
            );
            if (cached) {
                // Verify ownership if userId provided
                if (userId && cached.userId !== userId) {
                    throw new NotFoundException(`Subject with ID ${id} not found`);
                }
                return new SubjectDto(cached);
            }

            const where: { id: string; userId?: string } = { id };
            if (userId) {
                where.userId = userId;
            }

            const subject = await this.prismaService.subject.findFirst({
                where,
            });

            if (!subject) {
                throw new NotFoundException(`Subject with ID ${id} not found`);
            }

            // Cache the result as hash
            await this.redisService.setObjectWithPrefix(RedisPrefix.SUBJECT, `id:${id}`, subject);

            const subjectDto = new SubjectDto(subject);
            return subjectDto;
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

            // Take the subject with the highest order
            const lastSubject = await this.prismaService.subject.findFirst({
                orderBy: {
                    order: 'desc',
                },
            });

            // Auto-increment order for new subjects
            const newOrder = lastSubject ? lastSubject.order + 1 : 1;

            const subject = await this.prismaService.subject.create({
                data: {
                    name,
                    order: newOrder,
                    userId,
                },
            });

            // Cache the new subject as hash
            await this.redisService.setObjectWithPrefix(
                RedisPrefix.SUBJECT,
                `id:${subject.id}`,
                subject,
            );

            const subjectDto = new SubjectDto(subject);

            return subjectDto;
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
            // First, verify the subject exists and belongs to the user
            const where: { id: string; userId?: string } = { id };
            if (userId) {
                where.userId = userId;
            }

            const existingSubject = await this.prismaService.subject.findFirst({
                where,
            });

            if (!existingSubject) {
                throw new Error('Subject not found or unauthorized');
            }

            const subject = await this.prismaService.subject.update({
                where: { id },
                data: {
                    name: updateSubjectData.name,
                    order: updateSubjectData.order,
                },
            });

            const subjectDto = new SubjectDto({
                ...subject,
            });

            // Update the cache
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.SUBJECT,
                `id:${subjectDto.id}`,
                subjectDto,
            );

            // Clear the user's subject list cache
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `userId:${userId}`);

            return subjectDto;
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

            const subjects = await this.prismaService.subject.findMany({
                where: {
                    id: { in: subjectIds.map((subject) => subject.id) },
                    userId,
                },
            });

            const updatedSubjects = await Promise.all(
                subjects.map(async (subject, index) =>
                    this.prismaService.subject.update({
                        where: { id: subject.id },
                        data: { order: subjectIds[index].order },
                    }),
                ),
            );

            return updatedSubjects.map((subject) => new SubjectDto(subject));
        } catch (error: unknown) {
            PrismaErrorHandler.handle(error, 'reorder', this.subjectErrorMapping);
            throw error;
        }
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
            const where: { id: string; userId?: string } = { id };
            if (userId) {
                where.userId = userId;
            }

            const subject = await this.prismaService.subject.delete({
                where,
            });

            const subjectDto = new SubjectDto({
                ...subject,
            });

            // Remove from cache
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${id}`);
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `userId:${userId}`);

            return subjectDto;
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'delete', this.subjectErrorMapping);
        }
    }
}
