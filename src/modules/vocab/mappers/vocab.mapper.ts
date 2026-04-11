import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../shared/models/pagination.dto';
import { VocabDto } from '../models';
import { CreateTextTargetInput, VocabInput } from '../models/vocab.input';

type VocabEntity = ConstructorParameters<typeof VocabDto>[0];

export type VocabTranslationQueuePayload = {
    vocabId: string;
    textSource: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    subjectIds: string[];
    userId: string;
};

export class VocabMapper {
    public prepareCreate(input: VocabInput, userId: string): {
        prismaCreate: Prisma.VocabCreateInput;
        shouldQueueTranslation: boolean;
        queuePayload: Omit<VocabTranslationQueuePayload, 'vocabId'> | null;
    } {
        const {
            textSource,
            sourceLanguageCode,
            targetLanguageCode,
            textTargets,
            languageFolderId,
        } = input;

        const shouldQueueTranslation =
            Boolean(textSource) && Boolean(textTargets?.some((t) => !t.textTarget));
        const emptyTextTarget = textTargets?.find(
            (t) => !t.textTarget || t.textTarget.trim() === '',
        );
        const subjectIdsForTranslation = emptyTextTarget?.subjectIds?.length
            ? emptyTextTarget.subjectIds
            : input.subjectIds ?? [];

        const textTargetsToCreate =
            shouldQueueTranslation && !textTargets?.length
                ? [
                      {
                          textTarget: '',
                          grammar: '',
                          explanationSource: '',
                          explanationTarget: '',
                          subjectIds: subjectIdsForTranslation,
                      },
                  ]
                : textTargets;

        const prismaCreate: Prisma.VocabCreateInput = {
            textSource,
            sourceLanguage: { connect: { code: sourceLanguageCode } },
            targetLanguage: { connect: { code: targetLanguageCode } },
            languageFolder: { connect: { id: languageFolderId } },
            user: { connect: { id: userId } },
            textTargets: {
                create: (textTargetsToCreate ?? []).map((t) => this.mapTextTargetCreate(t)),
            },
        };

        const queuePayload =
            shouldQueueTranslation
                ? {
                      textSource,
                      sourceLanguageCode,
                      targetLanguageCode,
                      subjectIds: subjectIdsForTranslation,
                      userId,
                  }
                : null;

        return { prismaCreate, shouldQueueTranslation, queuePayload };
    }

    public buildUpdateInput(updateVocabData: Partial<VocabInput>): Prisma.VocabUpdateInput {
        return {
            ...(updateVocabData.textSource && { textSource: updateVocabData.textSource }),
            ...(updateVocabData.sourceLanguageCode && {
                sourceLanguageCode: updateVocabData.sourceLanguageCode,
            }),
            ...(updateVocabData.targetLanguageCode && {
                targetLanguageCode: updateVocabData.targetLanguageCode,
            }),
            ...(updateVocabData.textTargets && {
                textTargets: {
                    deleteMany: {},
                    create: updateVocabData.textTargets.map((t) => this.mapTextTargetCreate(t)),
                },
            }),
        };
    }

    public toResponse(vocab: VocabEntity): VocabDto {
        return new VocabDto(vocab);
    }

    public toResponseList(vocabs: VocabEntity[]): VocabDto[] {
        return vocabs.map((v) => this.toResponse(v));
    }

    public toPaginated(
        items: VocabDto[],
        totalItems: number,
        page: number,
        pageSize: number,
    ): PaginationDto<VocabDto> {
        return new PaginationDto<VocabDto>(items, totalItems, page, pageSize);
    }

    private mapTextTargetCreate(
        target: CreateTextTargetInput,
    ): Prisma.TextTargetCreateWithoutVocabInput {
        return {
            textTarget: target.textTarget,
            grammar: target.grammar,
            explanationSource: target.explanationSource,
            explanationTarget: target.explanationTarget,
            ...(target.subjectIds?.length && {
                textTargetSubjects: {
                    create: target.subjectIds.map((subjectId: string) => ({ subjectId })),
                },
            }),
            ...(target.wordTypeId && {
                wordType: { connect: { id: target.wordTypeId } },
            }),
            ...(target.vocabExamples?.length && {
                vocabExamples: {
                    create: target.vocabExamples.map((e) => ({
                        source: e.source,
                        target: e.target,
                    })),
                },
            }),
        };
    }
}
