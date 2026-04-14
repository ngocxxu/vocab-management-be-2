import { PaginationDto } from '@/shared/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { LanguageFolderDto, LanguageFolderInput } from '../dto';
import { LanguageFolderWithStatsDto } from '../dto/language-folder-with-stats.dto';
import { computeFolderStatus } from '../types/folder-status';
import { type FolderWithStatsRaw } from '../types/folder-with-stats.raw';

type LanguageFolderEntity = ConstructorParameters<typeof LanguageFolderDto>[0];

export class LanguageFolderMapper {
    public toCreatePayload(
        input: LanguageFolderInput,
        userId: string,
    ): {
        name: string;
        folderColor: string;
        sourceLanguageCode: string;
        targetLanguageCode: string;
        userId: string;
    } {
        return {
            name: input.name,
            folderColor: input.folderColor,
            sourceLanguageCode: input.sourceLanguageCode,
            targetLanguageCode: input.targetLanguageCode,
            userId,
        };
    }

    public buildUpdateInput(data: Partial<LanguageFolderInput>): Prisma.LanguageFolderUpdateInput {
        return {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.folderColor !== undefined && { folderColor: data.folderColor }),
            ...(data.sourceLanguageCode !== undefined && {
                sourceLanguageCode: data.sourceLanguageCode,
            }),
            ...(data.targetLanguageCode !== undefined && {
                targetLanguageCode: data.targetLanguageCode,
            }),
        };
    }

    public toResponse(entity: LanguageFolderEntity): LanguageFolderDto {
        return new LanguageFolderDto(entity);
    }

    public toResponseList(entities: LanguageFolderEntity[]): LanguageFolderDto[] {
        return entities.map((e) => this.toResponse(e));
    }

    public toStatsResponse(row: FolderWithStatsRaw): LanguageFolderWithStatsDto {
        return new LanguageFolderWithStatsDto(row, computeFolderStatus(row.vocabCount, row.averageMastery));
    }

    public toStatsResponseList(rows: FolderWithStatsRaw[]): LanguageFolderWithStatsDto[] {
        return rows.map((r) => this.toStatsResponse(r));
    }

    public toPaginated(items: LanguageFolderDto[], totalItems: number, page: number, pageSize: number): PaginationDto<LanguageFolderDto> {
        return new PaginationDto<LanguageFolderDto>(items, totalItems, page, pageSize);
    }
}
