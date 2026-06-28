import { LanguageRepository } from '@/domains/catalog/language/repositories/language.repository';
import { LanguageFolderRepository } from '@/domains/catalog/language-folder/repositories/language-folder.repository';
import { SubjectRepository } from '@/domains/catalog/subject/repositories/subject.repository';
import { UserRepository } from '@/domains/identity/user/repositories/user.repository';
import { NotificationService } from '@/domains/notification/services/notification.service';
import { ReminderService } from '@/domains/reminder/services/reminder.service';
import { VocabRelatedWordRepository } from '@/domains/vocab/repositories/vocab-related-word.repository';
import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { VocabMasteryService } from '@/domains/vocab/services/vocab-mastery.service';
import { VocabTrainerInput } from '@/domains/vocab-trainer/dto/vocab-trainer.input';
import { VocabTrainerRepository } from '@/domains/vocab-trainer/repositories/vocab-trainer.repository';
import { VocabTrainerService } from '@/domains/vocab-trainer/services/vocab-trainer.service';
import { Injectable } from '@nestjs/common';
import { QuestionType, TrainerStatus, UserRole } from '@prisma/client';
import { z } from 'zod';

export interface McpTool {
    name: string;
    description: string;
    schema: z.ZodSchema;
    minTier: UserRole;
    isWrite: boolean;
    timeoutMs: number;
    execute(params: unknown, userId: string): Promise<unknown>;
}

const TIER_ORDER: Record<UserRole, number> = { GUEST: 0, MEMBER: 1, ADMIN: 2 };

@Injectable()
export class McpToolRegistry {
    private readonly tools: McpTool[];

    public constructor(
        private readonly vocabRepository: VocabRepository,
        private readonly vocabRelatedWordRepository: VocabRelatedWordRepository,
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly vocabTrainerService: VocabTrainerService,
        private readonly languageFolderRepository: LanguageFolderRepository,
        private readonly subjectRepository: SubjectRepository,
        private readonly languageRepository: LanguageRepository,
        private readonly userRepository: UserRepository,
        private readonly notificationService: NotificationService,
        private readonly reminderService: ReminderService,
    ) {
        this.tools = this.registerTools();
    }

    public getToolsForTier(tier: UserRole): McpTool[] {
        const tierLevel = TIER_ORDER[tier] ?? 0;
        return this.tools.filter((t) => TIER_ORDER[t.minTier] <= tierLevel);
    }

    public getToolByName(name: string): McpTool | undefined {
        return this.tools.find((t) => t.name === name);
    }

    private registerTools(): McpTool[] {
        return [
            // ── Vocab: GUEST ─────────────────────────────────────────────────
            {
                name: 'lookup_vocab',
                description: 'Search vocabularies by source text keyword',
                schema: z.object({ query: z.string().describe('Search keyword'), limit: z.number().int().min(1).max(20).optional().default(10) }),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { query, limit } = params as { query: string; limit: number };
                    return this.vocabRepository.findWithPagination({ textSource: query } as never, userId, 0, limit);
                },
            },
            {
                name: 'get_vocab_detail',
                description: 'Get full details of a vocabulary item by ID',
                schema: z.object({ vocabId: z.string() }),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { vocabId } = params as { vocabId: string };
                    return this.vocabRepository.findById(vocabId, userId);
                },
            },
            {
                name: 'get_related_words',
                description: 'Get related/synonym words linked to a vocabulary item',
                schema: z.object({ vocabId: z.string() }),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params) => {
                    const { vocabId } = params as { vocabId: string };
                    return this.vocabRelatedWordRepository.findByVocabId(vocabId);
                },
            },
            {
                name: 'get_random_vocab',
                description: 'Get random vocabulary items for practice or inspiration',
                schema: z.object({ count: z.number().int().min(1).max(10).optional().default(5), languageFolderId: z.string().optional() }),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { count, languageFolderId } = params as { count: number; languageFolderId?: string };
                    return this.vocabRepository.findRandom(count, userId, languageFolderId);
                },
            },
            // ── Vocab: MEMBER ────────────────────────────────────────────────
            {
                name: 'get_weak_vocabs',
                description: 'Get vocabularies with low mastery scores that need review',
                schema: z.object({ limit: z.number().int().min(1).max(20).optional().default(10), page: z.number().int().min(1).optional().default(1) }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { limit, page } = params as { limit: number; page: number };
                    return this.vocabMasteryService.getTopProblematicVocabs(userId, 'all', limit, page);
                },
            },
            {
                name: 'get_vocab_progress',
                description: 'Get overall vocabulary learning progress and mastery statistics',
                schema: z.object({}),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (_params, userId) => this.vocabMasteryService.getSummary(userId),
            },
            {
                name: 'get_vocab_distribution',
                description: 'Get mastery score distribution across all vocabularies',
                schema: z.object({}),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (_params, userId) => this.vocabMasteryService.getMasteryDistribution(userId),
            },
            {
                name: 'get_vocab_by_subject',
                description: 'Get vocabularies filtered by a specific subject/topic',
                schema: z.object({ subjectId: z.string(), limit: z.number().int().min(1).max(20).optional().default(10) }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { subjectId, limit } = params as { subjectId: string; limit: number };
                    return this.vocabRepository.findWithPagination({ subjectId } as never, userId, 0, limit);
                },
            },
            {
                name: 'get_vocab_dashboard',
                description: 'Get a comprehensive vocabulary dashboard with summary stats and recent activity',
                schema: z.object({}),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 8000,
                execute: async (_params, userId) => this.vocabMasteryService.getDashboard(userId, ['summary', 'subjects', 'problematic', 'distribution'], {}),
            },
            // ── Trainer: MEMBER ──────────────────────────────────────────────
            {
                name: 'get_trainer_sessions',
                description: 'List trainer/exam sessions with their status and question types',
                schema: z.object({ limit: z.number().int().min(1).max(20).optional().default(10) }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { limit } = params as { limit: number };
                    return this.vocabTrainerRepository.findWithPagination({} as never, userId, 0, limit, { createdAt: 'desc' });
                },
            },
            {
                name: 'get_trainer_detail',
                description: 'Get full details of a trainer session including vocabulary assignments',
                schema: z.object({ trainerId: z.string() }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { trainerId } = params as { trainerId: string };
                    return this.vocabTrainerRepository.findByIdWithVocabs(trainerId, userId);
                },
            },
            {
                name: 'get_exam_result',
                description: 'Get exam results and scores for a completed trainer session',
                schema: z.object({ trainerId: z.string() }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { trainerId } = params as { trainerId: string };
                    return this.vocabTrainerRepository.findByIdWithVocabsAndResults(trainerId, userId);
                },
            },
            // ── Trainer: MEMBER (write) ──────────────────────────────────────
            {
                name: 'create_trainer_session',
                description: 'Create a new vocab trainer/exam session, optionally based on the weakest vocabularies',
                schema: z.object({
                    name: z.string().min(1).max(100).describe('Name for the trainer session'),
                    questionType: z
                        .enum(['MULTIPLE_CHOICE', 'FLIP_CARD', 'FILL_IN_THE_BLANK', 'MATCHING', 'TRUE_OR_FALSE', 'SHORT_ANSWER'])
                        .optional()
                        .default('MULTIPLE_CHOICE')
                        .describe('Question type for the session'),
                    useWeakVocabs: z.boolean().optional().default(true).describe('If true, automatically picks the weakest vocabularies'),
                    weakVocabLimit: z.number().int().min(1).max(20).optional().default(10).describe('How many weak vocabs to include'),
                    vocabIds: z.array(z.string()).optional().describe('Specific vocab IDs to include (overrides useWeakVocabs)'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 10000,
                execute: async (params, userId) => {
                    const { name, questionType, useWeakVocabs, weakVocabLimit, vocabIds } = params as {
                        name: string;
                        questionType: string;
                        useWeakVocabs: boolean;
                        weakVocabLimit: number;
                        vocabIds?: string[];
                    };

                    let assignmentIds: string[] = vocabIds ?? [];

                    if (assignmentIds.length === 0 && useWeakVocabs) {
                        const weakVocabs = await this.vocabMasteryService.getTopProblematicVocabs(userId, 'all', weakVocabLimit, 1);
                        assignmentIds = weakVocabs.map((v) => v.vocabId);
                    }

                    const input: VocabTrainerInput = {
                        name,
                        status: TrainerStatus.PENDING,
                        questionType: (questionType as QuestionType) ?? QuestionType.MULTIPLE_CHOICE,
                        vocabAssignmentIds: assignmentIds,
                    };

                    return this.vocabTrainerService.create(input, userId);
                },
            },
            // ── Context: GUEST ───────────────────────────────────────────────
            {
                name: 'get_my_folders',
                description: "List the user's language folders with vocabulary counts",
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (_params, userId) => this.languageFolderRepository.findWithStatsByUserId(userId),
            },
            {
                name: 'get_subjects',
                description: "List the user's vocabulary subjects/topics",
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (_params, userId) => this.subjectRepository.findByUserId(userId),
            },
            {
                name: 'get_languages',
                description: 'List all available languages supported by the app',
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async () => this.languageRepository.findAll(),
            },
            // ── Write Tools: MEMBER ──────────────────────────────────────────
            {
                name: 'create_immediate_reminder',
                description: 'Send an immediate reminder notification to the user',
                schema: z.object({
                    message: z.string().min(1).max(500).describe('Reminder message content'),
                    reminderType: z.string().optional().default('CUSTOM').describe('Type of reminder'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 8000,
                execute: async (params, userId) => {
                    const { message, reminderType } = params as { message: string; reminderType: string };
                    const user = await this.userRepository.findById(userId);
                    if (!user?.email) throw new Error('User email not found');
                    await this.reminderService.sendImmediateReminder(user.email, reminderType, 'custom', { message });
                    return { success: true, message: 'Reminder sent' };
                },
            },
            {
                name: 'create_scheduled_reminder',
                description: 'Schedule a reminder notification for the user at a specific future time',
                schema: z.object({
                    message: z.string().min(1).max(500).describe('Reminder message content'),
                    scheduledAt: z.string().datetime().describe('ISO 8601 datetime to send the reminder'),
                    reminderType: z.string().optional().default('CUSTOM').describe('Type of reminder'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 8000,
                execute: async (params, userId) => {
                    const { message, scheduledAt, reminderType } = params as { message: string; scheduledAt: string; reminderType: string };
                    const delayMs = new Date(scheduledAt).getTime() - Date.now();
                    if (delayMs <= 0) throw new Error('scheduledAt must be in the future');
                    const user = await this.userRepository.findById(userId);
                    if (!user?.email) throw new Error('User email not found');
                    await this.reminderService.scheduleReminder(user.email, reminderType, 'custom', { message }, delayMs);
                    return { success: true, scheduledAt };
                },
            },
            {
                name: 'mark_notification_read',
                description: 'Mark a specific notification as read',
                schema: z.object({ notificationId: z.string().describe('ID of the notification to mark as read') }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { notificationId } = params as { notificationId: string };
                    await this.notificationService.markAsRead(notificationId, userId);
                    return { success: true };
                },
            },
            {
                name: 'mark_all_notifications_read',
                description: 'Mark all unread notifications as read',
                schema: z.object({}),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 5000,
                execute: async (_params, userId) => {
                    const count = await this.notificationService.markAllAsRead(userId);
                    return { success: true, markedCount: count };
                },
            },
        ];
    }
}
