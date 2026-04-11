import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { Prisma, WordType } from '@prisma/client';

@Injectable()
export class WordTypeRepository extends BaseRepository {
    public constructor(
        prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {
        super(prismaService);
    }

    public async findAll(): Promise<WordType[]> {
        const cached = await this.redisService.jsonGet<WordType[]>(RedisPrefix.WORD_TYPE, 'all');
        if (cached) {
            return cached;
        }

        const wordTypes = await this.prisma.wordType.findMany({
            orderBy: {
                name: 'asc',
            },
        });

        await this.redisService.jsonSet(RedisPrefix.WORD_TYPE, 'all', wordTypes);

        return wordTypes;
    }

    public async findById(id: string): Promise<WordType | null> {
        const cached = await this.redisService.jsonGet<WordType>(RedisPrefix.WORD_TYPE, `id:${id}`);

        if (cached) {
            return cached;
        }

        const wordType = await this.prisma.wordType.findUnique({
            where: { id },
        });

        if (wordType) {
            await this.redisService.jsonSet(RedisPrefix.WORD_TYPE, `id:${id}`, wordType);
        }

        return wordType;
    }

    public async findByName(name: string): Promise<WordType | null> {
        return this.prisma.wordType.findUnique({
            where: { name },
        });
    }

    public async create(data: Prisma.WordTypeCreateInput): Promise<WordType> {
        const wordType = await this.prisma.wordType.create({
            data,
        });

        await this.redisService.del(RedisPrefix.WORD_TYPE, 'all');

        return wordType;
    }

    public async update(id: string, data: Prisma.WordTypeUpdateInput): Promise<WordType> {
        const wordType = await this.prisma.wordType.update({
            where: { id },
            data,
        });

        await this.redisService.del(RedisPrefix.WORD_TYPE, 'all');
        await this.redisService.del(RedisPrefix.WORD_TYPE, `id:${id}`);

        return wordType;
    }

    public async delete(id: string): Promise<WordType> {
        const wordType = await this.prisma.wordType.delete({
            where: { id },
        });

        await this.redisService.del(RedisPrefix.WORD_TYPE, 'all');
        await this.redisService.del(RedisPrefix.WORD_TYPE, `id:${id}`);

        return wordType;
    }
}
