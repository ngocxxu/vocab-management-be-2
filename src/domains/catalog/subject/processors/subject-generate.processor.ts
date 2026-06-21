import { SubjectSuggestionDto, GenerateSubjectsDto } from '@/domains/catalog/subject/dto';
import { SubjectRepository } from '@/domains/catalog/subject/repositories';
import { AiSubjectService } from '@/domains/catalog/subject/services/ai-subject.service';
import { NotificationGateway } from '@/domains/platform/events/gateway/notification.gateway';
import { EReminderType } from '@/domains/reminder/utils';
import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import type { SubjectGenerateJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService } from '@/shared';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

@Injectable()
@Processor(EReminderType.SUBJECT_GENERATE)
export class SubjectGenerateProcessor {
    public constructor(
        private readonly logger: LoggerService,
        private readonly aiSubjectService: AiSubjectService,
        private readonly subjectRepository: SubjectRepository,
        private readonly notificationGateway: NotificationGateway,
    ) {}

    @Process({
        name: 'generate-subjects',
        concurrency: QUEUE_CONFIG[EReminderType.SUBJECT_GENERATE].concurrency,
    })
    public async processSubjectGenerate(job: Job<SubjectGenerateJobData>): Promise<void> {
        const { textTarget, targetLanguageCode, userId } = job.data;
        const jobId = job.id ?? '';

        const aiNames = await this.aiSubjectService.suggestSubjects(textTarget, targetLanguageCode, userId);

        const existing = await this.subjectRepository.findByNamesInsensitive(aiNames, userId, targetLanguageCode);
        const existingLower = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

        const matchingExisting: SubjectSuggestionDto[] = [];
        const newCreativeIdeas: SubjectSuggestionDto[] = [];

        for (const name of aiNames) {
            const match = existingLower.get(name.toLowerCase());
            if (match) {
                matchingExisting.push(new SubjectSuggestionDto({ id: match.id, name: match.name }));
            } else {
                newCreativeIdeas.push(new SubjectSuggestionDto({ name }));
            }
        }

        const result = new GenerateSubjectsDto({ matchingExisting, newCreativeIdeas });

        this.notificationGateway.emitSubjectGenerateResult(userId, jobId, textTarget, result);
        this.logger.info(`Subject generate job ${jobId} completed for user ${userId}`);
    }
}
