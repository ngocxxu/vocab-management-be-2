import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { Language, Prisma } from '@prisma/client';

@Injectable()
export class LanguageRepository extends BaseRepository {
    public constructor(
        prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {
        super(prismaService);
    }

    public async findAll(): Promise<Language[]> {
        const cached = await this.redisService.jsonGet<Language[]>(RedisPrefix.LANGUAGE, 'all');
        if (cached) {
            return cached;
        }

        const languages = await this.prisma.language.findMany({
            orderBy: {
                name: 'asc',
            },
        });

        await this.redisService.jsonSet(RedisPrefix.LANGUAGE, 'all', languages);

        return languages;
    }

    public async findById(id: string): Promise<Language | null> {
        const cached = await this.redisService.jsonGet<Language>(RedisPrefix.LANGUAGE, `id:${id}`);
        if (cached) {
            return cached;
        }

        const language = await this.prisma.language.findUnique({
            where: { id },
        });

        if (language) {
            await this.redisService.jsonSet(RedisPrefix.LANGUAGE, `id:${id}`, language);
        }

        return language;
    }

    public async findByCode(code: string): Promise<Language | null> {
        return this.prisma.language.findUnique({
            where: { code },
        });
    }

    public async create(data: Prisma.LanguageCreateInput): Promise<Language> {
        const language = await this.prisma.language.create({
            data,
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');

        return language;
    }

    public async update(id: string, data: Prisma.LanguageUpdateInput): Promise<Language> {
        const language = await this.prisma.language.update({
            where: { id },
            data,
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');
        await this.redisService.del(RedisPrefix.LANGUAGE, `id:${id}`);

        return language;
    }

    public async delete(id: string): Promise<Language> {
        const language = await this.prisma.language.delete({
            where: { id },
        });

        await this.redisService.del(RedisPrefix.LANGUAGE, 'all');
        await this.redisService.del(RedisPrefix.LANGUAGE, `id:${id}`);

        return language;
    }
}
