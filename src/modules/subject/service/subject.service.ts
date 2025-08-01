import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Subject } from '@prisma/client';
import { IResponse, PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { SubjectDto, SubjectInput } from '../model';
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
            const cached = await this.redisService.jsonGetWithPrefix<Subject[]>(RedisPrefix.SUBJECT, `userId:${userId}`);
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

            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.SUBJECT,
                'all',
                subjects
            );

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
     * @returns Promise<SubjectDto> The subject DTO
     * @throws NotFoundException when subject is not found
     * @throws PrismaError when database operation fails
     */
    public async findOne(id: string): Promise<SubjectDto> {
        try {
            // Try to get from cache first using hash
            const cached = await this.redisService.getObjectWithPrefix<Subject>(RedisPrefix.SUBJECT, `id:${id}`);
            if (cached) {
                return new SubjectDto(cached);
            }
            const subject = await this.prismaService.subject.findUnique({
                where: { id },
            });

            if (!subject) {
                throw new NotFoundException(`Subject with ID ${id} not found`);
            }

            // Cache the result as hash
            await this.redisService.setObjectWithPrefix(
                RedisPrefix.SUBJECT,
                `id:${id}`,
                subject
            );

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
    public async create(createSubjectData: CreateSubjectInput, userId: string): Promise<SubjectDto> {
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
                subject
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
     * @returns Promise<SubjectDto> The updated subject DTO
     * @throws NotFoundException when subject is not found
     * @throws Error when validation fails
     * @throws PrismaError when database operation fails
     */
    public async update(id: string, updateSubjectData: SubjectInput): Promise<SubjectDto> {
        try {
            const { name, order } = updateSubjectData;

            // Check if subject exists
            const existingSubject = await this.prismaService.subject.findUnique({
                where: { id },
            });

            if (!existingSubject) {
                throw new NotFoundException(`Subject with ID ${id} not found`);
            }

            // If order is updated, need to adjust the order of other subjects
            if (order !== undefined && order !== existingSubject.order) {
                await this.prismaService.$transaction(async (prisma) => {
                    const oldOrder = existingSubject.order;
                    const newOrder = order;

                    if (newOrder > oldOrder) {
                        // Move down: decrease order of subjects in between
                        await prisma.subject.updateMany({
                            where: {
                                order: {
                                    gt: oldOrder,
                                    lte: newOrder,
                                },
                                id: { not: id },
                            },
                            data: {
                                order: { decrement: 1 },
                            },
                        });
                    } else {
                        // Move up: increase order of subjects in between
                        await prisma.subject.updateMany({
                            where: {
                                order: {
                                    gte: newOrder,
                                    lt: oldOrder,
                                },
                                id: { not: id },
                            },
                            data: {
                                order: { increment: 1 },
                            },
                        });
                    }
                });
            }

            // Update subject
            const subject = await this.prismaService.subject.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(order !== undefined && { order }),
                },
            });

            // Update cache as hash
            await this.redisService.setObjectWithPrefix(
                RedisPrefix.SUBJECT,
                `id:${id}`,
                subject
            );
            const subjectDto = new SubjectDto(subject);
            return subjectDto;
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'update', this.subjectErrorMapping);
        }
    }

    /**
     * Delete a subject from the database
     * @param id - The subject ID to delete
     * @returns Promise<SubjectDto> The deleted subject DTO
     * @throws PrismaError when database operation fails or subject not found
     */
    public async delete(id: string): Promise<SubjectDto> {
        try {
            const deletedSubject = await this.prismaService.$transaction(async (prisma) => {
                const subjectToDelete = await prisma.subject.findUnique({
                    where: { id },
                });

                if (!subjectToDelete) {
                    throw new NotFoundException(`Subject with ID ${id} not found`);
                }

                // Delete subject
                const deleted = await prisma.subject.delete({
                    where: { id },
                });

                // Update order of subjects with order greater than the deleted subject
                await prisma.subject.updateMany({
                    where: {
                        order: {
                            gt: subjectToDelete.order,
                        },
                    },
                    data: {
                        order: { decrement: 1 },
                    },
                });

                return deleted;
            });
            const subjectDto = new SubjectDto(deletedSubject);
            // Remove from cache
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${id}`);
            return subjectDto;
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'delete', this.subjectErrorMapping);
        }
    }
}
