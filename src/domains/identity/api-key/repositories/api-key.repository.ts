import { BaseRepository } from '@/database';
import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { ApiKey, LanguageFolder, Prisma } from '@prisma/client';

export type ApiKeyWithFolder = ApiKey & { languageFolder: LanguageFolder | null };

@Injectable()
export class ApiKeyRepository extends BaseRepository {
    public constructor(prismaService: PrismaService) {
        super(prismaService);
    }

    public async findAllByUserId(userId: string): Promise<ApiKeyWithFolder[]> {
        return this.prisma.apiKey.findMany({
            where: { userId },
            include: { languageFolder: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    public async findById(id: string, userId: string): Promise<ApiKeyWithFolder | null> {
        return this.prisma.apiKey.findFirst({
            where: { id, userId },
            include: { languageFolder: true },
        });
    }

    public async findByKeyHash(keyHash: string): Promise<ApiKeyWithFolder | null> {
        return this.prisma.apiKey.findUnique({
            where: { keyHash },
            include: { languageFolder: true },
        });
    }

    public async create(data: Prisma.ApiKeyCreateInput): Promise<ApiKeyWithFolder> {
        return this.prisma.apiKey.create({
            data,
            include: { languageFolder: true },
        });
    }

    public async delete(id: string): Promise<ApiKey> {
        return this.prisma.apiKey.delete({
            where: { id },
        });
    }

    public async touchLastUsedAt(id: string): Promise<void> {
        await this.prisma.apiKey.update({
            where: { id },
            data: { lastUsedAt: new Date() },
        });
    }
}
