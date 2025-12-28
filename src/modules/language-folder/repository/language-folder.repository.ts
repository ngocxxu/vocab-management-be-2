import { Injectable } from '@nestjs/common';
import { LanguageFolder, Prisma } from '@prisma/client';
import { PrismaService } from '../../common';
import { RedisService } from '../../common/provider/redis.provider';
import { buildPrismaWhere } from '../../common/util/query-builder.util';
import { RedisPrefix } from '../../common/util/redis-key.util';
import { LanguageFolderParamsInput } from '../model/language-folder-params.input';

@Injectable()
export class LanguageFolderRepository {
    public constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    public async findByUserId(userId: string): Promise<LanguageFolder[]> {
        const cached = await this.redisService.jsonGet<LanguageFolder[]>(
            RedisPrefix.LANGUAGE_FOLDER,
            `user:${userId}`,
        );
        if (cached) {
            return cached;
        }

        const folders = await this.prismaService.languageFolder.findMany({
            where: { userId },
            orderBy: {
                name: 'asc',
            },
            include: {
                sourceLanguage: true,
                targetLanguage: true,
            },
        });

        await this.redisService.jsonSet(
            RedisPrefix.LANGUAGE_FOLDER,
            `user:${userId}`,
            folders,
        );

        return folders;
    }

    public async findWithPagination(
        query: LanguageFolderParamsInput,
        userId: string,
        skip: number,
        take: number,
        orderBy: Prisma.LanguageFolderOrderByWithRelationInput,
    ): Promise<{ totalItems: number; folders: LanguageFolder[] }> {
        const where = buildPrismaWhere<LanguageFolderParamsInput, Prisma.LanguageFolderWhereInput>(
            query,
            {
                stringFields: ['name', 'sourceLanguageCode', 'targetLanguageCode'],
                customMap: (input, w) => {
                    if (userId) {
                        (w as Prisma.LanguageFolderWhereInput).userId = userId;
                    }
                },
            },
        );

        const [totalItems, folders] = await Promise.all([
            this.prismaService.languageFolder.count({ where }),
            this.prismaService.languageFolder.findMany({
                where,
                include: {
                    sourceLanguage: true,
                    targetLanguage: true,
                },
                orderBy,
                skip,
                take,
            }),
        ]);

        return { totalItems, folders };
    }

    public async findById(id: string, userId?: string): Promise<LanguageFolder | null> {
        const cached = await this.redisService.jsonGet<LanguageFolder>(
            RedisPrefix.LANGUAGE_FOLDER,
            `id:${id}`,
        );
        if (cached) {
            if (userId && cached.userId !== userId) {
                return null;
            }
            return cached;
        }

        const where: Prisma.LanguageFolderWhereUniqueInput & Prisma.LanguageFolderWhereInput = {
            id,
        };
        if (userId) {
            where.userId = userId;
        }

        const folder = await this.prismaService.languageFolder.findFirst({
            where,
            include: {
                sourceLanguage: true,
                targetLanguage: true,
            },
        });

        if (folder) {
            try {
                await this.redisService.jsonSet(
                    RedisPrefix.LANGUAGE_FOLDER,
                    `id:${id}`,
                    folder,
                );
            } catch (error) {
                if (error instanceof Error && error.message.includes('wrong Redis type')) {
                    await this.redisService.del(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
                    await this.redisService.jsonSet(
                        RedisPrefix.LANGUAGE_FOLDER,
                        `id:${id}`,
                        folder,
                    );
                } else {
                    throw error;
                }
            }
        }

        return folder;
    }

    public async create(data: {
        name: string;
        folderColor: string;
        sourceLanguageCode: string;
        targetLanguageCode: string;
        userId: string;
    }): Promise<LanguageFolder> {
        const folder = await this.prismaService.languageFolder.create({
            data,
            include: {
                sourceLanguage: true,
                targetLanguage: true,
            },
        });

        await this.redisService.jsonSet(
            RedisPrefix.LANGUAGE_FOLDER,
            `id:${folder.id}`,
            folder,
        );

        if (folder.userId) {
            await this.redisService.del(
                RedisPrefix.LANGUAGE_FOLDER,
                `user:${folder.userId}`,
            );
        }

        return folder;
    }

    public async update(
        id: string,
        data: Prisma.LanguageFolderUpdateInput,
    ): Promise<LanguageFolder> {
        const folder = await this.prismaService.languageFolder.update({
            where: { id },
            data,
            include: {
                sourceLanguage: true,
                targetLanguage: true,
            },
        });

        await this.redisService.jsonSet(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`, folder);

        if (folder.userId) {
            await this.redisService.del(
                RedisPrefix.LANGUAGE_FOLDER,
                `user:${folder.userId}`,
            );
        }

        return folder;
    }

    public async delete(id: string, userId?: string): Promise<LanguageFolder> {
        const where: Prisma.LanguageFolderWhereUniqueInput & Prisma.LanguageFolderWhereInput = {
            id,
        };
        if (userId) {
            where.userId = userId;
        }

        const folder = await this.prismaService.languageFolder.delete({
            where,
            include: {
                sourceLanguage: true,
                targetLanguage: true,
            },
        });

        await this.redisService.del(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
        if (folder.userId) {
            await this.redisService.del(
                RedisPrefix.LANGUAGE_FOLDER,
                `user:${folder.userId}`,
            );
        }

        return folder;
    }

    public async clearCache(): Promise<void> {
        await this.redisService.clearByPrefix(RedisPrefix.LANGUAGE_FOLDER);
    }

    public async clearCacheById(id: string): Promise<void> {
        await this.redisService.del(RedisPrefix.LANGUAGE_FOLDER, `id:${id}`);
    }
}
