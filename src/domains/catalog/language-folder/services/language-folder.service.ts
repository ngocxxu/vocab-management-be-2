import { getOrderBy, getPagination, IResponse, PaginationDto } from '@/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PlanQuotaService } from '../../plan/services/plan-quota.service';
import { LanguageFolderDto, LanguageFolderInput } from '../dto';
import { LanguageFolderParamsInput } from '../dto/language-folder-params.input';
import { LanguageFolderWithStatsDto } from '../dto/language-folder-with-stats.dto';
import { LanguageFolderBadRequestException, LanguageFolderInUseException, LanguageFolderNotFoundException } from '../exceptions';
import { LanguageFolderMapper } from '../mappers';
import { LanguageFolderRepository } from '../repositories/language-folder.repository';

@Injectable()
export class LanguageFolderService {
    private readonly languageFolderMapper = new LanguageFolderMapper();

    public constructor(
        private readonly languageFolderRepository: LanguageFolderRepository,
        private readonly planQuotaService: PlanQuotaService,
    ) {}

    public async findByUserId(userId: string): Promise<IResponse<LanguageFolderDto[]>> {
        const folders = await this.languageFolderRepository.findByUserId(userId);

        return {
            items: this.languageFolderMapper.toResponseList(folders),
            statusCode: HttpStatus.OK,
        };
    }

    public async findStatsByUserId(userId: string): Promise<IResponse<LanguageFolderWithStatsDto[]>> {
        const rows = await this.languageFolderRepository.findWithStatsByUserId(userId);
        const items: LanguageFolderWithStatsDto[] = this.languageFolderMapper.toStatsResponseList(rows);

        return {
            items,
            statusCode: HttpStatus.OK,
        };
    }

    public async find(query: LanguageFolderParamsInput, userId: string): Promise<PaginationDto<LanguageFolderDto>> {
        const { page, pageSize, skip, take } = getPagination({
            page: query.page,
            pageSize: query.pageSize,
            defaultPage: PaginationDto.DEFAULT_PAGE,
            defaultPageSize: PaginationDto.DEFAULT_PAGE_SIZE,
        });

        const orderBy = getOrderBy(query.sortBy, query.sortOrder, 'createdAt') as Prisma.LanguageFolderOrderByWithRelationInput;

        const { totalItems, folders } = await this.languageFolderRepository.findWithPagination(query, userId, skip, take, orderBy);

        const items = this.languageFolderMapper.toResponseList(folders);
        return this.languageFolderMapper.toPaginated(items, totalItems, page, pageSize);
    }

    public async findOne(id: string, userId?: string): Promise<LanguageFolderDto> {
        const folder = await this.languageFolderRepository.findById(id, userId);

        if (!folder) {
            throw new LanguageFolderNotFoundException(id);
        }

        return this.languageFolderMapper.toResponse(folder);
    }

    public async create(createFolderData: LanguageFolderInput, userId: string, role?: UserRole): Promise<LanguageFolderDto> {
        if (role !== undefined) {
            await this.planQuotaService.assertCreationQuota(userId, role, 'languageFolder');
        }
        const folder = await this.languageFolderRepository.create(this.languageFolderMapper.toCreatePayload(createFolderData, userId));

        return this.languageFolderMapper.toResponse(folder);
    }

    public async update(id: string, updateFolderData: Partial<LanguageFolderInput>, userId: string): Promise<LanguageFolderDto> {
        const existingFolder = await this.languageFolderRepository.findById(id, userId);

        if (!existingFolder) {
            throw new LanguageFolderBadRequestException('Language folder not found or unauthorized');
        }

        const folder = await this.languageFolderRepository.update(id, this.languageFolderMapper.buildUpdateInput(updateFolderData));

        return this.languageFolderMapper.toResponse(folder);
    }

    public async delete(id: string, userId?: string): Promise<LanguageFolderDto> {
        const existing = await this.findOne(id, userId);
        await this.assertNoVocabsInTrainers(id, existing.name);

        try {
            const folder = await this.languageFolderRepository.delete(id, userId);

            return this.languageFolderMapper.toResponse(folder);
        } catch (error: unknown) {
            // A trainer can get one of these words between the check and the delete; the database then refuses it (P2003).
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
                await this.assertNoVocabsInTrainers(id, existing.name);

                throw new LanguageFolderInUseException(id, existing.name, 1);
            }

            throw error;
        }
    }

    public async clearLanguageFolderCache(): Promise<void> {
        await this.languageFolderRepository.clearCache();
    }

    public async clearLanguageFolderCacheById(id: string): Promise<void> {
        await this.languageFolderRepository.clearCacheById(id);
    }

    /** Refuses with LanguageFolderInUse when a word of the folder is still in a trainer. */
    private async assertNoVocabsInTrainers(folderId: string, folderName: string): Promise<void> {
        const rows = await this.languageFolderRepository.findVocabsInTrainers(folderId);
        if (rows.length === 0) {
            return;
        }

        const vocabIds = [...new Set(rows.map((row) => row.vocabId))];
        throw new LanguageFolderInUseException(folderId, folderName, vocabIds.length, vocabIds.slice(0, 3));
    }
}
