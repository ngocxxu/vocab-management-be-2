import { captureSentryException, LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { NotificationAction, NotificationType, PriorityLevel } from '@prisma/client';
import { NotificationService } from '../../notification/services';
import { NotificationGateway } from '../../platform/events/gateway/notification.gateway';
import { EXPIRES_AT_30_DAYS } from '../../reminder/utils';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';

/** The AI-graded exam types that have a saved-result page. */
export type GradedExamType = 'fill-in-blank' | 'translation-audio';

/** Value of `data.kind` on the bell. The FE reads it to pick the message and the link. */
export const EXAM_BELL_KIND = {
    GRADED: 'EXAM_GRADED',
    GRADING_FAILED: 'EXAM_GRADING_FAILED',
} as const;

export interface GradedNotice {
    trainerId: string;
    userId: string;
    trainerName: string;
    examType: GradedExamType;
}

export interface FailedNotice {
    trainerId: string;
    userId: string;
    examType: GradedExamType;
}

/**
 * Bell and realtime notice when an AI grading finishes (#17). Call each method only after the write it reports.
 * Both methods are best effort: a failed notice is logged and sent to Sentry, never thrown, so grading and the job lock are not affected.
 */
@Injectable()
export class GradingNotificationService {
    public constructor(
        private readonly notificationService: NotificationService,
        private readonly notificationGateway: NotificationGateway,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly logger: LoggerService,
    ) {}

    /** The result is saved: the first grading, or a regrade that worked. */
    public async notifyGraded(notice: GradedNotice): Promise<void> {
        await this.runBestEffort(notice.trainerId, async () => this.createBell(notice.userId, EXAM_BELL_KIND.GRADED, notice.trainerId, notice.trainerName, notice.examType));
    }

    /**
     * The grading failed for this submit. Only the first failure of a submit notifies (decision: once per submit), so a failed
     * regrade (regradeCount > 0) stays silent. The user still sees the failure on the result page and the list badge.
     */
    public async notifyFailed(notice: FailedNotice): Promise<void> {
        await this.runBestEffort(notice.trainerId, async () => {
            const attempt = await this.vocabTrainerRepository.findAttemptByTrainerId(notice.trainerId, notice.userId);
            if (!attempt || attempt.regradeCount > 0) {
                return;
            }
            const trainer = await this.vocabTrainerRepository.findVocabTrainerByIdForUserMinimal(notice.trainerId, notice.userId);
            if (!trainer) {
                return;
            }
            await this.createBell(notice.userId, EXAM_BELL_KIND.GRADING_FAILED, notice.trainerId, trainer.name, notice.examType);
        });
    }

    /** Writes the bell, then checks the trainer. A trainer deleted during the insert gets its bells hidden, and no push (as the Reminder bell does). */
    private async createBell(userId: string, kind: string, trainerId: string, trainerName: string, examType: GradedExamType): Promise<void> {
        const data = { kind, trainerId, trainerName, examType };
        await this.notificationService.create({
            type: NotificationType.VOCAB_TRAINER,
            action: NotificationAction.CREATE,
            priority: PriorityLevel.MEDIUM,
            data,
            expiresAt: new Date(Date.now() + EXPIRES_AT_30_DAYS),
            isActive: true,
            recipientUserIds: [userId],
        });

        const trainer = await this.vocabTrainerRepository.findVocabTrainerByIdForUserMinimal(trainerId, userId);
        if (!trainer) {
            this.logger.info(`Grading bell of trainer ${trainerId} hidden: the trainer was deleted during the insert`);
            await this.notificationService.hideAllTrainerBells(trainerId);
            return;
        }

        this.notificationGateway.sendToUser(userId, kind, data);
    }

    private async runBestEffort(trainerId: string, step: () => Promise<void>): Promise<void> {
        try {
            await step();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Grading notice failed for trainer ${trainerId}: ${message}`);
            captureSentryException(error, { tags: { 'vocab_trainer.id': trainerId } });
        }
    }
}
