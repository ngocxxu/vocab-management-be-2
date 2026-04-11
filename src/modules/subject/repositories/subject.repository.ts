import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Subject } from '@prisma/client';
import { BaseRepository } from '../../../database';
import { PrismaService } from '../../shared';
import { RedisService } from '../../shared/services/redis.service';
import { RedisPrefix } from '../../shared/utils/redis-key.util';

@Injectable()
export class SubjectRepository extends BaseRepository {
    private readonly logger = new Logger(SubjectRepository.name);

    public constructor(prismaService: PrismaService, private readonly redisService: RedisService) {
        super(prismaService);
    }

    public async findByUserId(userId: string): Promise<Subject[]> {
        const cached = await this.redisService.jsonGet<Subject[]>(
            RedisPrefix.SUBJECT,
            `userId:${userId}`,
        );
        if (cached) {
            return cached;
        }

        const subjects = await this.prisma.subject.findMany({
            orderBy: {
                order: 'asc',
            },
            where: {
                userId,
            },
        });

        await this.redisService.jsonSet(RedisPrefix.SUBJECT, `userId:${userId}`, subjects);

        return subjects;
    }

    public async findById(id: string, userId?: string): Promise<Subject | null> {
        const cached = await this.redisService.jsonGet<Subject>(RedisPrefix.SUBJECT, `id:${id}`);
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

        const subject = await this.prisma.subject.findFirst({
            where,
        });

        if (subject) {
            try {
                await this.redisService.jsonSet(RedisPrefix.SUBJECT, `id:${id}`, subject);
            } catch (error) {
                if (error instanceof Error && error.message.includes('wrong Redis type')) {
                    await this.redisService.del(RedisPrefix.SUBJECT, `id:${id}`);
                    await this.redisService.jsonSet(RedisPrefix.SUBJECT, `id:${id}`, subject);
                } else {
                    throw error;
                }
            }
        }

        return subject;
    }

    public async findLastOrder(): Promise<Subject | null> {
        return this.prisma.subject.findFirst({
            orderBy: {
                order: 'desc',
            },
        });
    }

    public async findByIds(ids: string[], userId: string): Promise<Subject[]> {
        return this.prisma.subject.findMany({
            where: {
                id: { in: ids },
                userId,
            },
        });
    }

    public async findByIdsOrdered(ids: string[], userId: string): Promise<Subject[]> {
        return this.prisma.subject.findMany({
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
        return this.prisma.subject.findMany({
            where: { userId },
            select: { id: true },
        });
    }

    public async create(data: { name: string; order: number; userId: string }): Promise<Subject> {
        const subject = await this.prisma.subject.create({
            data,
        });

        try {
            await this.redisService.jsonSet(RedisPrefix.SUBJECT, `id:${subject.id}`, subject);
        } catch (error) {
            if (error instanceof Error && error.message.includes('wrong Redis type')) {
                await this.redisService.del(RedisPrefix.SUBJECT, `id:${subject.id}`);
                await this.redisService.jsonSet(RedisPrefix.SUBJECT, `id:${subject.id}`, subject);
            } else {
                throw error;
            }
        }

        if (subject.userId) {
            await this.redisService.del(RedisPrefix.SUBJECT, `userId:${subject.userId}`);
        }

        return subject;
    }

    public async update(id: string, data: Prisma.SubjectUpdateInput): Promise<Subject> {
        const subject = await this.prisma.subject.update({
            where: { id },
            data,
        });

        try {
            await this.redisService.jsonSet(RedisPrefix.SUBJECT, `id:${id}`, subject);
        } catch (error) {
            if (error instanceof Error && error.message.includes('wrong Redis type')) {
                await this.redisService.del(RedisPrefix.SUBJECT, `id:${id}`);
                await this.redisService.jsonSet(RedisPrefix.SUBJECT, `id:${id}`, subject);
            } else {
                throw error;
            }
        }

        if (subject.userId) {
            await this.redisService.del(RedisPrefix.SUBJECT, `userId:${subject.userId}`);
        }

        return subject;
    }

    public async updateMany(
        updates: Array<{ id: string; data: Prisma.SubjectUpdateInput }>,
    ): Promise<void> {
        await Promise.all(
            updates.map(async (update) =>
                this.prisma.subject.update({
                    where: { id: update.id },
                    data: update.data,
                }),
            ),
        );
    }

    public async updateManyInTransaction(
        updates: Array<{ id: string; data: Prisma.SubjectUpdateInput }>,
    ): Promise<void> {
        await this.runInTransaction(async (tx) => {
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

        const subject = await this.prisma.subject.delete({
            where,
        });

        await this.redisService.del(RedisPrefix.SUBJECT, `id:${id}`);
        if (subject.userId) {
            await this.redisService.del(RedisPrefix.SUBJECT, `userId:${subject.userId}`);
        }

        return subject;
    }

    public async countByUserId(userId: string): Promise<number> {
        return this.prisma.subject.count({ where: { userId } });
    }

    public async clearUserCache(userId: string): Promise<void> {
        try {
            await this.redisService.del(RedisPrefix.SUBJECT, `userId:${userId}`);

            const subjects = await this.findIdsByUserId(userId);
            for (const subject of subjects) {
                await this.redisService.del(RedisPrefix.SUBJECT, `id:${subject.id}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to clear subject cache: ${error}`);
        }
    }
}
