import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Subject } from '@prisma/client';
import { PrismaService } from '../../common';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';

@Injectable()
export class SubjectRepository {
    private readonly logger = new Logger(SubjectRepository.name);

    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    public async findByUserId(userId: string): Promise<Subject[]> {
        const cached = await this.redisService.jsonGetWithPrefix<Subject[]>(
            RedisPrefix.SUBJECT,
            `userId:${userId}`,
        );
        if (cached) {
            return cached;
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
            `userId:${userId}`,
            subjects,
        );

        return subjects;
    }

    public async findById(id: string, userId?: string): Promise<Subject | null> {
        const cached = await this.redisService.jsonGetWithPrefix<Subject>(
            RedisPrefix.SUBJECT,
            `id:${id}`,
        );
        if (cached) {
            if (userId && cached.userId !== userId) {
                return null;
            }
            return cached;
        }

        const where: { id: string; userId?: string } = { id };
        if (userId) {
            where.userId = userId;
        }

        const subject = await this.prismaService.subject.findFirst({
            where,
        });

        if (subject) {
            try {
                await this.redisService.jsonSetWithPrefix(RedisPrefix.SUBJECT, `id:${id}`, subject);
            } catch (error) {
                if (error instanceof Error && error.message.includes('wrong Redis type')) {
                    await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${id}`);
                    await this.redisService.jsonSetWithPrefix(
                        RedisPrefix.SUBJECT,
                        `id:${id}`,
                        subject,
                    );
                } else {
                    throw error;
                }
            }
        }

        return subject;
    }

    public async findLastOrder(): Promise<Subject | null> {
        return this.prismaService.subject.findFirst({
            orderBy: {
                order: 'desc',
            },
        });
    }

    public async findByIds(ids: string[], userId: string): Promise<Subject[]> {
        return this.prismaService.subject.findMany({
            where: {
                id: { in: ids },
                userId,
            },
        });
    }

    public async findByIdsOrdered(ids: string[], userId: string): Promise<Subject[]> {
        return this.prismaService.subject.findMany({
            where: {
                id: { in: ids },
                userId,
            },
            orderBy: {
                order: 'asc',
            },
        });
    }

    public async findIdsByUserId(userId: string): Promise<{ id: string }[]> {
        return this.prismaService.subject.findMany({
            where: { userId },
            select: { id: true },
        });
    }

    public async create(data: { name: string; order: number; userId: string }): Promise<Subject> {
        const subject = await this.prismaService.subject.create({
            data,
        });

        try {
            await this.redisService.jsonSetWithPrefix(
                RedisPrefix.SUBJECT,
                `id:${subject.id}`,
                subject,
            );
        } catch (error) {
            if (error instanceof Error && error.message.includes('wrong Redis type')) {
                await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${subject.id}`);
                await this.redisService.jsonSetWithPrefix(
                    RedisPrefix.SUBJECT,
                    `id:${subject.id}`,
                    subject,
                );
            } else {
                throw error;
            }
        }

        if (subject.userId) {
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `userId:${subject.userId}`);
        }

        return subject;
    }

    public async update(id: string, data: Prisma.SubjectUpdateInput): Promise<Subject> {
        const subject = await this.prismaService.subject.update({
            where: { id },
            data,
        });

        try {
            await this.redisService.jsonSetWithPrefix(RedisPrefix.SUBJECT, `id:${id}`, subject);
        } catch (error) {
            if (error instanceof Error && error.message.includes('wrong Redis type')) {
                await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${id}`);
                await this.redisService.jsonSetWithPrefix(RedisPrefix.SUBJECT, `id:${id}`, subject);
            } else {
                throw error;
            }
        }

        if (subject.userId) {
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `userId:${subject.userId}`);
        }

        return subject;
    }

    public async updateMany(
        updates: Array<{ id: string; data: Prisma.SubjectUpdateInput }>,
    ): Promise<void> {
        await Promise.all(
            updates.map(async (update) =>
                this.prismaService.subject.update({
                    where: { id: update.id },
                    data: update.data,
                }),
            ),
        );
    }

    public async updateManyInTransaction(
        updates: Array<{ id: string; data: Prisma.SubjectUpdateInput }>,
    ): Promise<void> {
        await this.prismaService.$transaction(async (tx) => {
            await Promise.all(
                updates.map(async (update) =>
                    tx.subject.update({
                        where: { id: update.id },
                        data: update.data,
                    }),
                ),
            );
        });
    }

    public async delete(id: string, userId?: string): Promise<Subject> {
        const where: { id: string; userId?: string } = { id };
        if (userId) {
            where.userId = userId;
        }

        const subject = await this.prismaService.subject.delete({
            where,
        });

        await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${id}`);
        if (subject.userId) {
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `userId:${subject.userId}`);
        }

        return subject;
    }

    public async clearUserCache(userId: string): Promise<void> {
        try {
            await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `userId:${userId}`);

            const subjects = await this.findIdsByUserId(userId);
            for (const subject of subjects) {
                await this.redisService.delWithPrefix(RedisPrefix.SUBJECT, `id:${subject.id}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to clear subject cache: ${error}`);
        }
    }
}
