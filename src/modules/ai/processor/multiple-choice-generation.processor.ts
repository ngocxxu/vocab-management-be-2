import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { LoggerService } from '../../common';
import { PrismaService } from '../../common/provider';
import { NotificationGateway } from '../../event/gateway/notification.gateway';
import { EReminderType } from '../../reminder/util';
import { VocabWithTextTargets } from '../../vocab-trainer/util';
import { AiService } from '../service/ai.service';

export interface MultipleChoiceGenerationJobData {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
}

@Injectable()
@Processor(EReminderType.MULTIPLE_CHOICE_GENERATION)
export class MultipleChoiceGenerationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly notificationGateway: NotificationGateway,
        private readonly prismaService: PrismaService,
    ) {}

    @Process('generate-questions')
    public async processMultipleChoiceGeneration(
        job: Job<MultipleChoiceGenerationJobData>,
    ): Promise<void> {
        const { vocabTrainerId, vocabList, userId } = job.data;
        const jobId = job.id || '';

        try {
            this.logger.info(
                `Processing multiple choice generation job ${job.id} for user ${userId}`,
            );

            this.notificationGateway.emitMultipleChoiceGenerationProgress(
                userId,
                jobId,
                'generating',
            );

            const questions = await this.aiService.generateMultipleChoiceQuestions(
                vocabList,
                userId,
            );

            await this.prismaService.vocabTrainer.update({
                where: { id: vocabTrainerId },
                data: {
                    questionAnswers: questions.map((question) => ({
                        correctAnswer: question.correctAnswer,
                        type: question.type,
                        content: question.content,
                        options: question.options.map((option) => ({
                            label: option.label,
                            value: option.value,
                        })),
                    })),
                },
            });

            this.notificationGateway.emitMultipleChoiceGenerationProgress(
                userId,
                jobId,
                'completed',
                {
                    questions,
                },
            );

            this.logger.info(`Multiple choice generation job ${job.id} completed successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Multiple choice generation job ${job.id} failed: ${errorMessage}`);

            this.notificationGateway.emitMultipleChoiceGenerationProgress(userId, jobId, 'failed', {
                error: errorMessage,
            });

            throw error;
        }
    }
}

