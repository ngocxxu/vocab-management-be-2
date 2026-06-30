import { LanguageRepository } from '@/domains/catalog/language/repositories/language.repository';
import { LanguageFolderRepository } from '@/domains/catalog/language-folder/repositories/language-folder.repository';
import { SubjectRepository } from '@/domains/catalog/subject/repositories/subject.repository';
import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';
import { UserRepository } from '@/domains/identity/user/repositories/user.repository';
import { NotificationService } from '@/domains/notification/services/notification.service';
import { ReminderService } from '@/domains/reminder/services/reminder.service';
import { VocabRelatedWordRepository } from '@/domains/vocab/repositories/vocab-related-word.repository';
import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { VocabMasteryService } from '@/domains/vocab/services/vocab-mastery.service';
import { VocabService } from '@/domains/vocab/services/vocab.service';
import { SubmitMultipleChoiceInput } from '@/domains/vocab-trainer/dto/submit-multiple-choice.dto';
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

export const TIER_ORDER: Record<UserRole, number> = { GUEST: 0, MEMBER: 1, ADMIN: 2 };

export function getHighestRole(roles: string[]): UserRole {
    return roles.reduce<UserRole>((highest, role) => {
        const candidate = Object.values(UserRole).includes(role as UserRole) ? (role as UserRole) : UserRole.GUEST;
        return TIER_ORDER[candidate] > TIER_ORDER[highest] ? candidate : highest;
    }, UserRole.GUEST);
}

@Injectable()
export class McpToolRegistry {
    private readonly tools: McpTool[];

    public constructor(
        private readonly vocabRepository: VocabRepository,
        private readonly vocabRelatedWordRepository: VocabRelatedWordRepository,
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly vocabService: VocabService,
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly vocabTrainerService: VocabTrainerService,
        private readonly languageFolderRepository: LanguageFolderRepository,
        private readonly subjectRepository: SubjectRepository,
        private readonly subjectService: SubjectService,
        private readonly wordTypeService: WordTypeService,
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
                name: 'list_vocab',
                description:
                    "Search/list user's vocab. Filter by query (text match), subjectId, or languageFolderId; or set random=true for practice picks. " +
                    "Results' id usable in get_vocab_detail/get_related_words.",
                schema: z.object({
                    query: z.string().optional().describe('Text search keyword'),
                    subjectId: z.string().optional().describe('Filter by subject ID from get_subjects'),
                    languageFolderId: z.string().optional().describe('Filter by folder ID from get_my_folders'),
                    random: z.coerce.boolean().optional().default(false).describe('If true, return random items instead of filtered/sorted'),
                    limit: z.coerce.number().int().min(1).max(20).optional().default(10).describe('Max results'),
                }),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { query, subjectId, languageFolderId, random, limit } = params as {
                        query?: string;
                        subjectId?: string;
                        languageFolderId?: string;
                        random: boolean;
                        limit: number;
                    };
                    if (random) {
                        return this.vocabRepository.findRandom(limit, userId, languageFolderId);
                    }
                    const filter = {
                        ...(query && { textSource: query }),
                        ...(subjectId && { subjectId }),
                        ...(languageFolderId && { languageFolderId }),
                    };
                    return this.vocabRepository.findWithPagination(filter as never, userId, 0, limit);
                },
            },
            {
                name: 'get_vocab_detail',
                description: 'Get full details of a vocab item by ID',
                schema: z.object({ vocabId: z.string().describe('Vocab ID from list_vocab or get_weak_vocabs') }),
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
                description: 'Get related/synonym words linked to a vocab item',
                schema: z.object({ vocabId: z.string().describe('Vocab ID from list_vocab or get_weak_vocabs') }),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params) => {
                    const { vocabId } = params as { vocabId: string };
                    return this.vocabRelatedWordRepository.findByVocabId(vocabId);
                },
            },
            // ── Vocab: MEMBER (write) ────────────────────────────────────────
            {
                name: 'create_vocab',
                description: 'Create a vocab entry. Requires languageFolderId from get_my_folders. Language codes are BCP-47 (e.g. "en", "vi").',
                schema: z.object({
                    textSource: z.string().min(1).max(200).describe('Source word or phrase'),
                    sourceLanguageCode: z.string().min(2).max(10).describe('BCP-47 source language code'),
                    targetLanguageCode: z.string().min(2).max(10).describe('BCP-47 target language code'),
                    languageFolderId: z.string().describe('Folder ID from get_my_folders'),
                    textTarget: z.string().min(1).max(200).describe('Translation/definition in target language'),
                    grammar: z.string().optional().default('').describe('Part of speech (e.g. "noun")'),
                    explanationSource: z.string().optional().default('').describe('Explanation in source language'),
                    explanationTarget: z.string().optional().default('').describe('Explanation in target language'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 10000,
                execute: async (params, userId) => {
                    const { textSource, sourceLanguageCode, targetLanguageCode, languageFolderId, textTarget, grammar, explanationSource, explanationTarget } = params as {
                        textSource: string;
                        sourceLanguageCode: string;
                        targetLanguageCode: string;
                        languageFolderId: string;
                        textTarget: string;
                        grammar: string;
                        explanationSource: string;
                        explanationTarget: string;
                    };
                    return this.vocabService.create(
                        {
                            textSource,
                            sourceLanguageCode,
                            targetLanguageCode,
                            languageFolderId,
                            textTargets: [{ textTarget, grammar, explanationSource, explanationTarget }],
                        },
                        userId,
                    );
                },
            },
            {
                name: 'update_vocab',
                description: 'Update a vocab entry. Only provided fields change. Get vocabId from list_vocab.',
                schema: z.object({
                    vocabId: z.string().describe('Vocab ID from list_vocab'),
                    textSource: z.string().min(1).max(200).optional().describe('New source word/phrase'),
                    textTarget: z.string().min(1).max(200).optional().describe('New target translation'),
                    grammar: z.string().optional().describe('Part of speech'),
                    explanationSource: z.string().optional().describe('Explanation in source language'),
                    explanationTarget: z.string().optional().describe('Explanation in target language'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 10000,
                execute: async (params, userId) => {
                    const { vocabId, textSource, textTarget, grammar, explanationSource, explanationTarget } = params as {
                        vocabId: string;
                        textSource?: string;
                        textTarget?: string;
                        grammar?: string;
                        explanationSource?: string;
                        explanationTarget?: string;
                    };
                    const textTargets =
                        textTarget !== undefined || grammar !== undefined || explanationSource !== undefined || explanationTarget !== undefined
                            ? [{ textTarget: textTarget ?? '', grammar: grammar ?? '', explanationSource: explanationSource ?? '', explanationTarget: explanationTarget ?? '' }]
                            : undefined;
                    return this.vocabService.update(vocabId, { textSource, textTargets } as never, userId);
                },
            },
            {
                name: 'delete_vocab',
                description: 'Delete a vocab entry permanently. Get vocabId from list_vocab. Confirm with user first.',
                schema: z.object({ vocabId: z.string().describe('Vocab ID from list_vocab') }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 8000,
                execute: async (params, userId) => {
                    const { vocabId } = params as { vocabId: string };
                    return this.vocabService.delete(vocabId, userId);
                },
            },
            {
                name: 'get_word_types',
                description: 'List available word types (noun, verb, adjective, etc.) for reference',
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async () => this.wordTypeService.find(),
            },
            {
                name: 'submit_multiple_choice_answers',
                description: 'Submit answers for a MULTIPLE_CHOICE trainer session. Get questions via get_trainer_detail first.',
                schema: z.object({
                    trainerId: z.string().describe('Trainer session ID from get_trainer_sessions'),
                    answers: z
                        .array(
                            z.object({
                                systemSelected: z.string().describe('Correct answer text'),
                                userSelected: z.string().describe('Answer text the user chose'),
                            }),
                        )
                        .min(1)
                        .describe('Array of answer pairs'),
                    countTime: z.coerce.number().int().min(0).optional().describe('Time taken in seconds'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 10000,
                execute: async (params, userId) => {
                    const { trainerId, answers, countTime } = params as {
                        trainerId: string;
                        answers: { systemSelected: string; userSelected: string }[];
                        countTime?: number;
                    };
                    const user = await this.userRepository.findById(userId);
                    if (!user) throw new Error('User not found');
                    const input: SubmitMultipleChoiceInput = {
                        questionType: QuestionType.MULTIPLE_CHOICE,
                        wordTestSelects: answers,
                        countTime,
                    } as SubmitMultipleChoiceInput;
                    return this.vocabTrainerService.submitMultipleChoice(trainerId, input, user);
                },
            },
            // ── Subject: MEMBER (write) ──────────────────────────────────────
            {
                name: 'create_subject',
                description: 'Create a subject/topic for organizing vocab',
                schema: z.object({ name: z.string().min(1).max(100).describe('Subject name (e.g. "IT", "Business")') }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 8000,
                execute: async (params, userId) => {
                    const { name } = params as { name: string };
                    return this.subjectService.create({ name, order: 0 } as never, userId);
                },
            },
            {
                name: 'delete_subject',
                description: 'Delete a subject/topic. Get subjectId from get_subjects. Confirm with user first.',
                schema: z.object({ subjectId: z.string().describe('Subject ID from get_subjects') }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 8000,
                execute: async (params, userId) => {
                    const { subjectId } = params as { subjectId: string };
                    return this.subjectService.delete(subjectId, userId);
                },
            },
            // ── Reminder: MEMBER (write) ─────────────────────────────────────
            {
                name: 'cancel_reminder',
                description: 'Cancel a scheduled reminder by job ID, returned by create_reminder',
                schema: z.object({ jobId: z.string().describe('Job ID returned by create_reminder') }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 5000,
                execute: async (params) => {
                    const { jobId } = params as { jobId: string };
                    await this.reminderService.cancelReminder(jobId);
                    return { success: true, jobId };
                },
            },
            // ── Vocab: MEMBER ────────────────────────────────────────────────
            {
                name: 'get_weak_vocabs',
                description: 'Get low-mastery vocab needing review. Each result has vocabId+masteryScore; use vocabId in create_trainer_session.vocabIds.',
                schema: z.object({
                    limit: z.coerce.number().int().min(1).max(20).optional().default(10).describe('Max items'),
                    page: z.coerce.number().int().min(1).optional().default(1).describe('Page number, starting at 1'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { limit, page } = params as { limit: number; page: number };
                    const results = await this.vocabMasteryService.getTopProblematicVocabs(userId, 'all', limit, page);
                    if (results.length === 0) {
                        return {
                            message: 'No weak vocabularies found. User has no practice history yet, or all vocabularies are performing well. Do not call this tool again.',
                            items: [],
                        };
                    }
                    return results;
                },
            },
            {
                name: 'get_vocab_dashboard',
                description: 'Get vocab learning stats: summary, subject breakdown, top problematic items, mastery distribution. Use for any "how am I doing" question.',
                schema: z.object({}),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 8000,
                execute: async (_params, userId) => this.vocabMasteryService.getDashboard(userId, ['summary', 'subjects', 'problematic', 'distribution'], {}),
            },
            // ── Trainer: MEMBER ──────────────────────────────────────────────
            {
                name: 'get_trainer_sessions',
                description: 'List trainer/exam sessions with status and question type. Result id usable as trainerId in get_trainer_detail.',
                schema: z.object({ limit: z.coerce.number().int().min(1).max(20).optional().default(10).describe('Max sessions') }),
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
                description: 'Get a trainer session with assigned vocab. Set includeResults=true to also get scores for a completed session.',
                schema: z.object({
                    trainerId: z.string().describe('Trainer session ID from get_trainer_sessions'),
                    includeResults: z.coerce.boolean().optional().default(false).describe('Include exam results/scores'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { trainerId, includeResults } = params as { trainerId: string; includeResults: boolean };
                    return includeResults
                        ? this.vocabTrainerRepository.findByIdWithVocabsAndResults(trainerId, userId)
                        : this.vocabTrainerRepository.findByIdWithVocabs(trainerId, userId);
                },
            },
            // ── Trainer: MEMBER (write) ──────────────────────────────────────
            {
                name: 'create_trainer_session',
                description:
                    'Create a vocab trainer/exam session. Omit vocabIds + leave useWeakVocabs=true to auto-train on weakest vocab; ' +
                    'pass real vocabIds from get_weak_vocabs/list_vocab to override.',
                schema: z.object({
                    name: z.string().min(1).max(100).describe('Session name'),
                    questionType: z
                        .enum(['MULTIPLE_CHOICE', 'FLIP_CARD', 'FILL_IN_THE_BLANK', 'MATCHING', 'TRUE_OR_FALSE', 'SHORT_ANSWER'])
                        .optional()
                        .default('MULTIPLE_CHOICE')
                        .describe('Question type'),
                    useWeakVocabs: z.coerce.boolean().optional().default(true).describe('Auto-select weakest vocab up to weakVocabLimit when vocabIds is omitted'),
                    weakVocabLimit: z.coerce.number().int().min(1).max(20).optional().default(10).describe('How many weak vocabs to auto-select (ignored if vocabIds given)'),
                    vocabIds: z.array(z.string()).optional().describe('Real vocab IDs from get_weak_vocabs/list_vocab. Overrides useWeakVocabs when present.'),
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
                description: "List user's language folders with vocab counts. Result id usable as languageFolderId elsewhere.",
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (_params, userId) => this.languageFolderRepository.findWithStatsByUserId(userId),
            },
            {
                name: 'get_subjects',
                description: "List user's subjects/topics. Result id usable as subjectId elsewhere.",
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (_params, userId) => this.subjectRepository.findByUserId(userId),
            },
            {
                name: 'get_languages',
                description: 'List languages supported by the app',
                schema: z.object({}),
                minTier: UserRole.GUEST,
                isWrite: false,
                timeoutMs: 5000,
                execute: async () => this.languageRepository.findAll(),
            },
            // ── Write Tools: MEMBER ──────────────────────────────────────────
            {
                name: 'create_reminder',
                description: 'Send or schedule a reminder notification. Omit scheduledAt to send immediately; provide a future ISO 8601 datetime to schedule.',
                schema: z.object({
                    message: z.string().min(1).max(500).describe('Reminder message content'),
                    scheduledAt: z.string().datetime().optional().describe('Future ISO 8601 datetime; omit to send immediately'),
                    reminderType: z.string().optional().default('CUSTOM').describe('Reminder type'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: true,
                timeoutMs: 8000,
                execute: async (params, userId) => {
                    const { message, scheduledAt, reminderType } = params as { message: string; scheduledAt?: string; reminderType: string };
                    const user = await this.userRepository.findById(userId);
                    if (!user?.email) throw new Error('User email not found');

                    if (!scheduledAt) {
                        await this.reminderService.sendImmediateReminder(user.email, reminderType, 'custom', { message });
                        return { success: true, message: 'Reminder sent' };
                    }

                    const delayMs = new Date(scheduledAt).getTime() - Date.now();
                    if (delayMs <= 0) throw new Error('scheduledAt must be in the future');
                    await this.reminderService.scheduleReminder(user.email, reminderType, 'custom', { message }, delayMs);
                    return { success: true, scheduledAt };
                },
            },
            {
                name: 'get_notifications',
                description: "Get user's notifications. Call before mark_notification_read to get IDs.",
                schema: z.object({
                    unreadOnly: z.coerce.boolean().optional().default(true).describe('If true (default), only unread; set false to include read'),
                }),
                minTier: UserRole.MEMBER,
                isWrite: false,
                timeoutMs: 5000,
                execute: async (params, userId) => {
                    const { unreadOnly } = params as { unreadOnly: boolean };
                    return unreadOnly ? this.notificationService.findUnreadByUser(userId) : this.notificationService.findByUser(userId);
                },
            },
            {
                name: 'mark_notification_read',
                description: 'Mark a specific notification as read',
                schema: z.object({ notificationId: z.string().describe('Notification ID') }),
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
