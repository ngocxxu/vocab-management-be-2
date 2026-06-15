import { PaginationDto } from '@/shared/dto/pagination.dto';
import { getPagination } from '@/shared/utils/pagination.util';
import { Injectable } from '@nestjs/common';
import { Subject, TextTarget, TextTargetSubject, VocabExample, WordType } from '@prisma/client';
import { TextTargetDto } from '../dto';
import { CreateTextTargetStandaloneInput } from '../dto/create-text-target-standalone.input';
import { TextTargetQueryParamsInput } from '../dto/text-target-query-params.input';
import { UpdateTextTargetInput } from '../dto/update-text-target.input';
import { TextTargetNotFoundException, VocabNotFoundException } from '../exceptions';
import { VocabRepository } from '../repositories/vocab.repository';

type TextTargetWithIncludes = TextTarget & {
    wordType: WordType | null;
    vocabExamples: VocabExample[];
    textTargetSubjects: (TextTargetSubject & { subject: Subject })[];
};

@Injectable()
export class VocabTextTargetService {
    public constructor(private readonly vocabRepository: VocabRepository) {}

    public async findAll(vocabId: string, userId: string, query: TextTargetQueryParamsInput): Promise<PaginationDto<TextTargetDto>> {
        await this.assertVocab(vocabId, userId);

        const { page, pageSize, skip, take } = getPagination({
            page: query.page,
            pageSize: query.pageSize,
            defaultPage: PaginationDto.DEFAULT_PAGE,
            defaultPageSize: PaginationDto.DEFAULT_PAGE_SIZE,
        });

        const { totalItems, items } = await this.vocabRepository.findTextTargetsByVocabId(vocabId, {
            textTarget: query.textTarget,
            grammar: query.grammar,
            wordTypeId: query.wordTypeId,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
            skip,
            take,
        });

        const dtos = items.map((tt) => new TextTargetDto(this.normalizeIncludes(tt)));
        return new PaginationDto(dtos, totalItems, page, pageSize);
    }

    public async findOne(vocabId: string, id: string, userId: string): Promise<TextTargetDto> {
        await this.assertVocab(vocabId, userId);
        const textTarget = await this.vocabRepository.findTextTargetById(id);

        if (!textTarget || textTarget.vocabId !== vocabId) {
            throw new TextTargetNotFoundException(id);
        }

        return new TextTargetDto(this.normalizeIncludes(textTarget));
    }

    public async create(vocabId: string, userId: string, input: CreateTextTargetStandaloneInput): Promise<TextTargetDto> {
        await this.assertVocab(vocabId, userId);
        const textTarget = await this.vocabRepository.createTextTarget(vocabId, {
            wordTypeId: input.wordTypeId,
            textTarget: input.textTarget,
            grammar: input.grammar,
            explanationSource: input.explanationSource,
            explanationTarget: input.explanationTarget,
            subjectIds: input.subjectIds,
            vocabExamples: input.vocabExamples?.map((ex) => ({ source: ex.source, target: ex.target })),
        });
        return new TextTargetDto(this.normalizeIncludes(textTarget));
    }

    public async update(vocabId: string, id: string, userId: string, input: UpdateTextTargetInput): Promise<TextTargetDto> {
        await this.assertVocab(vocabId, userId);
        const existing = await this.vocabRepository.findTextTargetById(id);

        if (!existing || existing.vocabId !== vocabId) {
            throw new TextTargetNotFoundException(id);
        }

        const textTarget = await this.vocabRepository.updateTextTarget(id, {
            wordTypeId: input.wordTypeId,
            textTarget: input.textTarget,
            grammar: input.grammar,
            explanationSource: input.explanationSource,
            explanationTarget: input.explanationTarget,
            subjectIds: input.subjectIds,
            vocabExamples: input.vocabExamples?.map((ex) => ({ source: ex.source, target: ex.target })),
        });
        return new TextTargetDto(this.normalizeIncludes(textTarget));
    }

    public async remove(vocabId: string, id: string, userId: string): Promise<void> {
        await this.assertVocab(vocabId, userId);
        const existing = await this.vocabRepository.findTextTargetById(id);

        if (!existing || existing.vocabId !== vocabId) {
            throw new TextTargetNotFoundException(id);
        }

        await this.vocabRepository.deleteTextTargetById(id);
    }

    private normalizeIncludes(
        tt: TextTargetWithIncludes,
    ): TextTarget & { wordType?: WordType; vocabExamples?: VocabExample[]; textTargetSubjects?: (TextTargetSubject & { subject?: Subject })[] } {
        return {
            ...tt,
            wordType: tt.wordType ?? undefined,
        };
    }

    private async assertVocab(vocabId: string, userId: string): Promise<void> {
        const vocab = await this.vocabRepository.findById(vocabId, userId);

        if (!vocab) {
            throw new VocabNotFoundException(vocabId);
        }
    }
}
