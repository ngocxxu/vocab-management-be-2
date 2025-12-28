import { Injectable } from '@nestjs/common';
import { Language, Prisma } from '@prisma/client';
import { PrismaService } from '../../common';
import { RedisService } from '../../common/provider/redis.provider';
import { RedisPrefix } from '../../common/util/redis-key.util';

@Injectable()
export class LanguageRepository {
    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    public async findAll(): Promise<Language[]> {
        const cached = await this.redisService.jsonGet<Language[]>(
            RedisPrefix.LANGUAGE,
            'all',
        );
        if (cached) {
            return cached;
        }

        const languages = await this.prismaService.language.findMany({
            orderBy: {
                name: 'asc',
            },
        });

        await this.redisService.jsonSet(RedisPrefix.LANGUAGE, 'all', languages);

        return languages;
    }

    public async findById(id: string): Promise<Language | null> {
        const cached = await this.redisService.jsonGet<Language>(
            RedisPrefix.LANGUAGE,
            `id:${id}`,
        );
        if (cached) {
            return cached;
        }

        const language = await this.prismaService.language.findUnique({
            where: { id },
        });

        if (language) {
            await this.redisService.jsonSet(
                RedisPrefix.LANGUAGE,
                `id:${id}`,
                language,
            );
        }

        return language;
    }

    public async findByCode(code: string): Promise<Language | null> {
        return this.prismaService.language.findUnique({
            where: { code },
        });
    }

    public async create(data: Prisma.LanguageCreateInput): Promise<Language> {
        const language = await this.prismaService.language.create({
            data,
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');

        return language;
    }

    public async update(id: string, data: Prisma.LanguageUpdateInput): Promise<Language> {
        const language = await this.prismaService.language.update({
            where: { id },
            data,
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');
        await this.redisService.del(RedisPrefix.LANGUAGE, `id:${id}`);

        return language;
    }

    public async delete(id: string): Promise<Language> {
        const language = await this.prismaService.language.delete({
            where: { id },
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');
        await this.redisService.del(RedisPrefix.LANGUAGE, `id:${id}`);

        return language;
    }
}

