import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { LoggerService } from '../../common';
import { PrismaService } from '../../common/provider';
import { NotificationGateway } from '../../event/gateway/notification.gateway';
import { EReminderType } from '../../reminder/util';
import { AiService } from '../service/ai.service';

export interface AudioEvaluationJobData {
    fileId: string;
    targetDialogue: Array<{ speaker: string; text: string }>;
    sourceLanguage: string;
    targetLanguage: string;
    sourceWords: string[];
    targetStyle?: 'formal' | 'informal';
    targetAudience?: string;
    userId: string;
    vocabTrainerId: string;
}

@Injectable()
@Processor(EReminderType.AUDIO_EVALUATION)
export class AudioEvaluationProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiService: AiService,
        private readonly notificationGateway: NotificationGateway,
        private readonly prismaService: PrismaService,
    ) {}

    @Process('evaluate-audio')
    public async processAudioEvaluation(job: Job<AudioEvaluationJobData>): Promise<void> {
        const {
            fileId,
            targetDialogue,
            sourceLanguage,
            targetLanguage,
            sourceWords,
            targetStyle,
            targetAudience,
            userId,
            vocabTrainerId,
        } = job.data;

        const jobId = job.id || '';

        try {
            this.logger.info(`Processing audio evaluation job ${job.id} for user ${userId}`);

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'evaluating');

            const audioBuffer = await this.aiService.downloadAudioFromCloudinary(fileId);
            const mimeType = 'audio/webm';

            const transcript = await this.aiService.transcribeAudio(
                audioBuffer,
                mimeType,
                sourceLanguage,
                userId,
            );

            const evaluationResult = await this.aiService.evaluateTranslation({
                targetDialogue,
                transcript,
                sourceLanguage,
                targetLanguage,
                sourceWords,
                targetStyle,
                targetAudience,
                userId,
            });

            const markdownReport = this.aiService.formatMarkdownReport(
                evaluationResult,
                transcript,
            );

            await this.prismaService.vocabTrainerResult.deleteMany({
                where: { vocabTrainerId },
            });

            await this.prismaService.vocabTrainerResult.create({
                data: {
                    vocabTrainerId,
                    status: TrainerStatus.COMPLETED,
                    userSelected: transcript,
                    systemSelected: targetDialogue.map((d) => d.text).join(' '),
                    data: {
                        transcript,
                        markdownReport,
                    },
                },
            });

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'completed', {
                transcript,
                markdownReport,
            });

            this.logger.info(`Audio evaluation job ${job.id} completed successfully`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Audio evaluation job ${job.id} failed: ${errorMessage}`);

            this.notificationGateway.emitAudioEvaluationProgress(userId, jobId, 'failed', {
                error: errorMessage,
            });

            throw error;
        }
    }
}

