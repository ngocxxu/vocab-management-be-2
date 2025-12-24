import { Injectable } from '@nestjs/common';
import { Prisma, WordType } from '@prisma/client';
import { PrismaService } from '../../common';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';

@Injectable()
export class WordTypeRepository {
    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    public async findAll(): Promise<WordType[]> {
        const cached = await this.redisService.jsonGetWithPrefix<WordType[]>(
            RedisPrefix.WORD_TYPE,
            'all',
        );
        if (cached) {
            return cached;
        }

        const wordTypes = await this.prismaService.wordType.findMany({
            orderBy: {
                name: 'asc',
            },
        });

        await this.redisService.jsonSetWithPrefix(RedisPrefix.WORD_TYPE, 'all', wordTypes);

        return wordTypes;
    }

    public async findById(id: string): Promise<WordType | null> {
        const cached = await this.redisService.getObjectWithPrefix<WordType>(
            RedisPrefix.WORD_TYPE,
            `id:${id}`,
        );
        if (cached) {
            return cached;
        }

        const wordType = await this.prismaService.wordType.findUnique({
            where: { id },
        });

        if (wordType) {
            await this.redisService.setObjectWithPrefix(
                RedisPrefix.WORD_TYPE,
                `id:${id}`,
                wordType,
            );
        }

        return wordType;
    }

    public async findByName(name: string): Promise<WordType | null> {
        return this.prismaService.wordType.findUnique({
            where: { name },
        });
    }

    public async create(data: Prisma.WordTypeCreateInput): Promise<WordType> {
        const wordType = await this.prismaService.wordType.create({
            data,
        });

        await this.redisService.delWithPrefix(RedisPrefix.WORD_TYPE, 'all');

        return wordType;
    }

    public async update(id: string, data: Prisma.WordTypeUpdateInput): Promise<WordType> {
        const wordType = await this.prismaService.wordType.update({
            where: { id },
            data,
        });

        await this.redisService.delWithPrefix(RedisPrefix.WORD_TYPE, 'all');
        await this.redisService.delWithPrefix(RedisPrefix.WORD_TYPE, `id:${id}`);

        return wordType;
    }

    public async delete(id: string): Promise<WordType> {
        const wordType = await this.prismaService.wordType.delete({
            where: { id },
        });

        await this.redisService.delWithPrefix(RedisPrefix.WORD_TYPE, 'all');
        await this.redisService.delWithPrefix(RedisPrefix.WORD_TYPE, `id:${id}`);

        return wordType;
    }
}

