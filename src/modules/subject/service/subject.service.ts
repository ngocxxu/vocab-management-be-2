import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
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

    public constructor(private readonly prismaService: PrismaService) {}

    /**
     * Find all subjects in the database
     * @returns Promise<SubjectDto[]> Array of subject DTOs
     * @throws PrismaError when database operation fails
     */
    public async find(): Promise<SubjectDto[]> {
        try {
            const subjects = await this.prismaService.subject.findMany({
                orderBy: {
                    order: 'asc',
                },
            });

            return subjects.map((subject) => new SubjectDto(subject));
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
            const subject = await this.prismaService.subject.findUnique({
                where: { id },
            });

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
    public async create(createSubjectData: CreateSubjectInput): Promise<SubjectDto> {
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
                },
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

            return new SubjectDto(subject);
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

            return new SubjectDto(deletedSubject);
        } catch (error: unknown) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'delete', this.subjectErrorMapping);
        }
    }
}
