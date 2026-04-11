import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { VocabTranslationJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Prisma, TextTarget } from '@prisma/client';
import { Job } from 'bullmq';
import { AiService } from '../../ai/services/ai.service';
import { EReminderType } from '../../reminder/utils';
import { CreateTextTargetInput } from '../dto/vocab.input';
import { VocabRepository } from '../repositories/vocab.repository';

type VocabWithTextTargets = Prisma.VocabGetPayload<{
    include: {
        textTargets: {
            include: {
                wordType: true;
                vocabExamples: true;
                textTargetSubjects: {
                    include: {
                        subject: true;
                    };
                };
            };
        };
    };
}>;

@Processor(EReminderType.VOCAB_TRANSLATION)
@Injectable()
export class VocabTranslationProcessor {
    public constructor(
        private readonly aiService: AiService,
        private readonly vocabRepository: VocabRepository,
        private readonly logger: LoggerService,
    ) {}

    @Process({
        name: 'translate-vocab',
        concurrency: QUEUE_CONFIG[EReminderType.VOCAB_TRANSLATION].concurrency,
    })
    public async processVocabTranslation(job: Job<VocabTranslationJobData>): Promise<void> {
        const { vocabId, textSource, sourceLanguageCode, targetLanguageCode, subjectIds, userId } = job.data;

        const jobId = job.id?.toString() || 'unknown';

        try {
            this.logger.info(`Processing vocab translation job ${jobId} for vocab ${vocabId} (user ${userId})`);

            const vocab = await this.findVocabWithValidation(vocabId, userId);
            await this.removeEmptyTextTarget(vocab);

            const translatedData = await this.translateVocab(textSource, sourceLanguageCode, targetLanguageCode, subjectIds, userId);

            await this.updateVocabWithTranslation(vocabId, translatedData);
            await this.vocabRepository.clearListCaches();

            this.logger.info(`Vocab translation job ${jobId} completed successfully for vocab ${vocabId}`);
        } catch (error) {
            this.handleJobError(error, jobId, vocabId);
            throw error;
        }
    }

    private async findVocabWithValidation(vocabId: string, userId: string): Promise<VocabWithTextTargets> {
        const vocab = await this.vocabRepository.findById(vocabId, userId);

        if (!vocab) {
            throw new Error(`Vocab ${vocabId} not found for user ${userId}`);
        }

        return vocab as VocabWithTextTargets;
    }

    private async removeEmptyTextTarget(vocab: VocabWithTextTargets): Promise<void> {
        const emptyTextTarget = this.findEmptyTextTarget(vocab.textTargets);

        if (!emptyTextTarget) {
            return;
        }

        await this.vocabRepository.deleteTextTargetById(emptyTextTarget.id);
    }

    private findEmptyTextTarget(textTargets: TextTarget[]): TextTarget | undefined {
        return textTargets.find((tt) => !tt.textTarget || tt.textTarget.trim() === '');
    }

    private async translateVocab(
        textSource: string,
        sourceLanguageCode: string,
        targetLanguageCode: string,
        subjectIds: string[] | undefined,
        userId: string,
    ): Promise<CreateTextTargetInput> {
        return this.aiService.translateVocab(textSource, sourceLanguageCode, targetLanguageCode, subjectIds, userId);
    }

    private async updateVocabWithTranslation(vocabId: string, translatedData: CreateTextTargetInput): Promise<void> {
        const textTargetCreateData: Prisma.TextTargetCreateWithoutVocabInput = {
            textTarget: translatedData.textTarget,
            grammar: translatedData.grammar,
            explanationSource: translatedData.explanationSource,
            explanationTarget: translatedData.explanationTarget,
        };

        const subjectIdsRelation = this.buildSubjectIdsRelation(translatedData.subjectIds);
        const vocabExamplesRelation = this.buildVocabExamplesRelation(translatedData.vocabExamples);

        if (subjectIdsRelation) {
            textTargetCreateData.textTargetSubjects = subjectIdsRelation;
        }

        if (vocabExamplesRelation) {
            textTargetCreateData.vocabExamples = vocabExamplesRelation;
        }

        const updateData: Prisma.VocabUpdateInput = {
            textTargets: {
                create: textTargetCreateData,
            },
        };

        await this.vocabRepository.update(vocabId, updateData);
    }

    private buildSubjectIdsRelation(subjectIds: string[] | undefined): Prisma.TextTargetCreateInput['textTargetSubjects'] | undefined {
        if (!subjectIds || subjectIds.length === 0) {
            return undefined;
        }

        return {
            create: subjectIds.map((subjectId) => ({ subjectId })),
        };
    }

    private buildVocabExamplesRelation(vocabExamples: CreateTextTargetInput['vocabExamples']): Prisma.TextTargetCreateInput['vocabExamples'] | undefined {
        if (!vocabExamples || vocabExamples.length === 0) {
            return undefined;
        }

        return {
            create: vocabExamples.map((example) => ({
                source: example.source,
                target: example.target,
            })),
        };
    }

    private handleJobError(error: unknown, jobId: string, vocabId: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Vocab translation job ${jobId} failed for vocab ${vocabId}: ${errorMessage}`);
    }
}
