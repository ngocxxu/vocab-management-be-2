import { Injectable } from '@nestjs/common';
import { VocabAutocompleteDto, VocabRelatedWordsDto } from '../dto';
import { UpsertRelatedWordsInput } from '../dto/upsert-related-words.input';
import { VocabNotFoundException, VocabRelatedWordBadRequestException, VocabRelatedWordNotFoundException } from '../exceptions';
import { VocabRelatedWordMapper } from '../mappers/vocab-related-word.mapper';
import { VocabRelatedWordRepository } from '../repositories';
import { VocabRepository } from '../repositories/vocab.repository';
import { type NormalizedRelatedWordInput, normalizeAndValidateRelatedWords } from '../utils';

@Injectable()
export class VocabRelatedWordService {
    private readonly vocabRelatedWordMapper = new VocabRelatedWordMapper();

    public constructor(
        private readonly vocabRepository: VocabRepository,
        private readonly vocabRelatedWordRepository: VocabRelatedWordRepository,
    ) {}

    public async getRelatedWords(vocabId: string, userId: string): Promise<VocabRelatedWordsDto> {
        await this.assertSourceVocab(vocabId, userId);
        const relations = await this.vocabRelatedWordRepository.findByVocabId(vocabId);

        return this.vocabRelatedWordMapper.toGroupedDto(relations);
    }

    public async upsertRelatedWords(vocabId: string, userId: string, input: UpsertRelatedWordsInput): Promise<VocabRelatedWordsDto> {
        const sourceVocab = await this.assertSourceVocab(vocabId, userId);
        const normalizedWords = normalizeAndValidateRelatedWords(vocabId, input.words);
        await this.assertLinkedVocabsInFolder(normalizedWords, userId, sourceVocab.languageFolderId);

        await this.vocabRelatedWordRepository.upsertSymmetricSet(vocabId, normalizedWords);

        return this.getRelatedWords(vocabId, userId);
    }

    public async deleteRelatedWord(vocabId: string, relatedWordId: string, userId: string): Promise<void> {
        await this.assertSourceVocab(vocabId, userId);
        const relation = await this.vocabRelatedWordRepository.findByIdAndVocabId(relatedWordId, vocabId);

        if (!relation) {
            throw new VocabRelatedWordNotFoundException(relatedWordId);
        }

        await this.vocabRelatedWordRepository.deleteSymmetricPair(relatedWordId, vocabId);
    }

    public async autocomplete(vocabId: string, userId: string, query: string): Promise<VocabAutocompleteDto[]> {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 1) {
            throw new VocabRelatedWordBadRequestException('Query must contain at least 1 character');
        }

        const sourceVocab = await this.assertSourceVocab(vocabId, userId);
        const existingRelations = await this.vocabRelatedWordRepository.findByVocabId(vocabId);
        const excludeIds = [vocabId, ...this.getLinkedVocabIds(existingRelations)];
        const results = await this.vocabRelatedWordRepository.autocomplete({
            userId,
            languageFolderId: sourceVocab.languageFolderId,
            query: trimmedQuery,
            excludeIds,
        });

        return this.vocabRelatedWordMapper.toAutocompleteDtos(results);
    }

    private async assertSourceVocab(vocabId: string, userId: string): Promise<{ id: string; languageFolderId: string }> {
        const vocab = await this.vocabRepository.findById(vocabId, userId);

        if (!vocab) {
            throw new VocabNotFoundException(vocabId);
        }

        return {
            id: vocab.id,
            languageFolderId: vocab.languageFolderId,
        };
    }

    private getLinkedVocabIds(words: Array<{ linkedVocabId?: string | null }>): string[] {
        return words.map((word) => word.linkedVocabId).filter((linkedVocabId): linkedVocabId is string => Boolean(linkedVocabId));
    }

    private async assertLinkedVocabsInFolder(words: NormalizedRelatedWordInput[], userId: string, languageFolderId: string): Promise<void> {
        const linkedVocabIds = this.getLinkedVocabIds(words);
        const linkedVocabs = await this.vocabRepository.findByIds(linkedVocabIds, userId);

        if (linkedVocabs.length !== linkedVocabIds.length) {
            throw new VocabNotFoundException('one or more linked vocabs');
        }

        const invalidFolderVocab = linkedVocabs.find((vocab) => vocab.languageFolderId !== languageFolderId);
        if (invalidFolderVocab) {
            throw new VocabNotFoundException(invalidFolderVocab.id);
        }
    }
}
