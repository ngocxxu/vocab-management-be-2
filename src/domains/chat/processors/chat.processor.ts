import { AiProviderFactory } from '@/domains/ai/providers/ai-provider.factory';
import { ChatHistoryMessage, IAiProvider } from '@/domains/ai/providers/ai-provider.interface';
import { UserRepository } from '@/domains/identity/user/repositories/user.repository';
import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import { JOB_NAMES } from '@/queues/constants/queue.constants';
import type { AiChatJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService, RedisPrefix, RedisService, RedisPubSubService } from '@/shared';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { ChatRole, UserRole } from '@prisma/client';
import { Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { EReminderType } from '../../reminder/utils';
import { CHAT_CANCEL_KEY, CHAT_CHANNELS, CHAT_CONFIRM_TIMEOUT_MS } from '../constants';
import { ChatMessageRepository } from '../repositories';
import { AbortControllerRegistry } from '../services/abort-controller-registry.service';
import { McpToolRegistry } from '../services/mcp-tool-registry.service';

const TIER_MAX_ITERATIONS: Record<string, number> = { ADMIN: 10, MEMBER: 7, GUEST: 3 };
const FALLBACK_MESSAGE = "I wasn't able to complete this in the allowed steps. Please try rephrasing.";
const OUT_OF_SCOPE_MESSAGE = 'Sorry, I can only help with app-related questions.';
const CANCELLED_MESSAGE = 'Generation cancelled.';
const ACTION_CANCELLED_MESSAGE = 'Action cancelled.';

@Processor(EReminderType.AI_CHAT)
export class ChatProcessor {
    public constructor(
        private readonly redisPubSub: RedisPubSubService,
        private readonly redisService: RedisService,
        private readonly aiProviderFactory: AiProviderFactory,
        private readonly userRepository: UserRepository,
        private readonly chatMessageRepository: ChatMessageRepository,
        private readonly mcpToolRegistry: McpToolRegistry,
        private readonly abortRegistry: AbortControllerRegistry,
        private readonly logger: LoggerService,
    ) {}

    @Process({ name: JOB_NAMES.aiChat, concurrency: QUEUE_CONFIG[EReminderType.AI_CHAT].concurrency })
    public async handleChatJob(job: Job<AiChatJobData>): Promise<void> {
        const { userId, messageId, tier } = job.data;

        if (await this.isCancelled(userId)) return;

        const signal = this.abortRegistry.create(userId);
        const startTime = Date.now();
        this.logger.info(`chat.job.start userId=${userId} tier=${tier} jobId=${String(job.id)}`);

        try {
            const { provider, systemPrompt, history } = await this.buildContext(userId, tier, messageId);
            const lastAssistantMsg = [...history].reverse().find((m) => m.role === 'assistant')?.content;
            const recentHistory = history.slice(-6, -1);
            const intent = await this.classifyIntent(provider, userId, history[history.length - 1]?.content ?? '', signal, lastAssistantMsg, recentHistory);
            this.logger.info(`chat.intent userId=${userId} intent=${intent}`);

            if (intent === 'OUT_OF_SCOPE') {
                await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, OUT_OF_SCOPE_MESSAGE);
                await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: OUT_OF_SCOPE_MESSAGE });
                return;
            }

            await this.runAgenticLoop({ provider, systemPrompt, history, tier, userId, startTime, signal });
        } catch (error) {
            if ((error as { code?: string })?.code === 'ERR_CANCELED' || (error instanceof Error && error.name === 'CanceledError')) {
                this.logger.info(`chat.job.aborted userId=${userId} jobId=${String(job.id)}`);
                await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: CANCELLED_MESSAGE });
                return;
            }
            this.logger.error(`chat.job.failed userId=${userId} error=${error instanceof Error ? error.message : String(error)} jobId=${String(job.id)}`);
            throw error;
        } finally {
            this.abortRegistry.delete(userId);
        }
    }

    @OnQueueFailed()
    public async handleJobFailed(job: Job<AiChatJobData>, error: Error): Promise<void> {
        const { userId } = job.data;
        const maxAttempts = job.opts?.attempts ?? 3;
        if (job.attemptsMade >= maxAttempts) {
            await this.redisPubSub.publish(CHAT_CHANNELS.error(userId), {
                message: 'AI service error. Please try again later.',
                retryable: false,
            });
            captureSentryException(error, { tags: { userId, jobId: String(job.id) } });
            this.logger.error(`chat.job.dlq userId=${userId} jobId=${String(job.id)} error=${error.message}`);
        }
    }

    private async isCancelled(userId: string): Promise<boolean> {
        const cancelled = await this.redisService.get(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId));
        if (!cancelled) return false;
        await this.redisService.del(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId));
        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: CANCELLED_MESSAGE });
        return true;
    }

    private async buildContext(userId: string, tier: string, messageId: string): Promise<{ provider: IAiProvider; systemPrompt: string; history: ChatHistoryMessage[] }> {
        const [provider, user, dbMessages] = await Promise.all([
            this.aiProviderFactory.getChatProvider(userId),
            this.userRepository.findById(userId),
            this.chatMessageRepository.findLastN(userId, 10),
        ]);

        const currentMessage = dbMessages.find((m) => m.id === messageId);
        if (!currentMessage) throw new Error(`Chat message ${messageId} not found for userId ${userId}`);

        const userContext = user ? `Name: ${user.firstName} ${user.lastName}, Tier: ${user.role}` : `Tier: ${tier}`;
        const systemPrompt = `You are an AI assistant inside a vocabulary learning app.
You ONLY answer questions related to: vocabulary, learning progress, folders, trainer sessions, reminders, and features of this application.
If the user asks about anything unrelated to the app, politely refuse.
Never invent IDs (folder, vocab, etc.) — always call the relevant lookup tool (e.g. get_my_folders) first to obtain a real ID before using it in another tool call.
If a tool call returns an error, do not stay silent: explain the problem to the user in plain language
and suggest a next step (e.g. retry with a valid folder, or call the lookup tool first).
User context: ${userContext}`;

        const history: ChatHistoryMessage[] = dbMessages
            .filter((m) => m.id !== messageId)
            .map((m) => ({ role: m.role === ChatRole.USER ? ('user' as const) : ('assistant' as const), content: m.message }));
        history.push({ role: 'user', content: currentMessage.message });

        return { provider, systemPrompt, history };
    }

    private async classifyIntent(
        provider: IAiProvider,
        userId: string,
        userMessage: string,
        signal?: AbortSignal,
        lastAssistantMessage?: string,
        recentHistory?: ChatHistoryMessage[],
    ): Promise<string> {
        let contextBlock = '';
        if (recentHistory && recentHistory.length > 0) {
            const turns = recentHistory.map((m) => `${m.role}: ${m.content}`).join('\n');
            contextBlock = `Recent conversation:\n${turns}\n`;
        } else if (lastAssistantMessage) {
            contextBlock = `Previous assistant message: ${lastAssistantMessage}\n`;
        }
        const appScope =
            'APP = vocabulary, learning progress, folders, trainer sessions, reminders, features of this application,' +
            ' greetings, general conversational messages, or short replies (yes/no/ok/sure/cancel) that continue an ongoing app conversation.';
        const outScope = 'OUT_OF_SCOPE = unrelated topics with no app context (general knowledge, coding, news, politics, etc).';
        const intentPrompt = `Classify the intent. Reply with exactly APP or OUT_OF_SCOPE.\n${appScope}\n${outScope}\n${contextBlock}User message: ${userMessage}`;
        try {
            const result = await provider.generateContent(intentPrompt, userId, { signal });
            return result.trim().toUpperCase().includes('OUT_OF_SCOPE') ? 'OUT_OF_SCOPE' : 'APP';
        } catch (error) {
            if ((error as { code?: string })?.code === 'ERR_CANCELED' || (error instanceof Error && error.name === 'CanceledError')) throw error;
            return 'APP'; // fail open on non-abort errors
        }
    }

    private async runAgenticLoop(ctx: {
        provider: IAiProvider;
        systemPrompt: string;
        history: ChatHistoryMessage[];
        tier: string;
        userId: string;
        startTime: number;
        signal?: AbortSignal;
    }): Promise<void> {
        const { provider, systemPrompt, history, tier, userId, startTime, signal } = ctx;
        const tierRole = Object.values(UserRole).includes(tier as UserRole) ? (tier as UserRole) : UserRole.GUEST;
        const toolDeclarations = this.mcpToolRegistry.getToolsForTier(tierRole).map((t) => {
            const rawSchema = z.toJSONSchema(t.schema) as Record<string, unknown>;
            const parameters = Object.fromEntries(Object.entries(rawSchema).filter(([key]) => key !== '$schema'));
            return { name: t.name, description: t.description, parameters };
        });

        const maxIterations = TIER_MAX_ITERATIONS[tier] ?? 2;
        const toolCallsMeta: Array<{ toolName: string; success: boolean; latencyMs: number }> = [];
        let lastToolName: string | null = null;
        let sameToolCount = 0;
        let emptyTextStrikes = 0;
        const MAX_EMPTY_TEXT_STRIKES = 1;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            if (await this.isCancelled(userId)) return;
            const response = await provider.chat({ systemPrompt, history, tools: toolDeclarations, signal });

            if (response.type === 'text') {
                const content = response.content?.trim();
                if (!content) {
                    emptyTextStrikes++;
                    this.logger.warn(`chat.empty.text userId=${userId} iter=${iteration} strikes=${emptyTextStrikes} — provider returned empty text`);

                    if (emptyTextStrikes > MAX_EMPTY_TEXT_STRIKES) {
                        this.logger.warn(`chat.empty.text userId=${userId} — giving up after ${emptyTextStrikes} empty responses`);
                        await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, FALLBACK_MESSAGE, toolCallsMeta);
                        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: FALLBACK_MESSAGE });
                        return;
                    }

                    history.push({
                        role: 'user',
                        content: 'Your last response was empty. Please continue: either retry the action with corrected parameters, or explain the error to me.',
                    });
                    continue;
                }
                const latencyMs = Date.now() - startTime;
                await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, content, toolCallsMeta, response.tokenCount, latencyMs);
                await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content });
                this.logger.info(`chat.job.done userId=${userId} tokens=${response.tokenCount ?? 0} latencyMs=${latencyMs} tools=${toolCallsMeta.length} iter=${iteration + 1}`);
                return;
            }

            const tool = this.mcpToolRegistry.getToolByName(response.name);

            if (response.name === lastToolName) {
                sameToolCount++;
                if (sameToolCount >= 2) {
                    this.logger.warn(`chat.loop.duplicate toolName=${response.name} userId=${userId} — breaking loop`);
                    await this.finalizeWithSummary({ provider, systemPrompt, history, userId, startTime, signal, toolCallsMeta, reason: 'duplicate-tool-break' });
                    return;
                }
            } else {
                lastToolName = response.name;
                sameToolCount = 0;
            }

            history.push({ role: 'assistant', content: '', toolCalls: [{ id: response.toolCallId, name: response.name, arguments: JSON.stringify(response.params) }] });

            const toolStart = Date.now();
            let toolResult: string;
            let toolSuccess = false;

            if (tool?.isWrite) {
                const requestId = nanoid();
                await this.redisPubSub.publish(CHAT_CHANNELS.event(userId), {
                    type: 'confirm_required',
                    requestId,
                    action: response.name,
                    params: response.params,
                });

                const confirmKey = CHAT_CHANNELS.confirm(userId, requestId);
                const blockingClient = this.redisService.createBlockingClient();
                let brpopResult: [string, string] | null = null;
                try {
                    brpopResult = await blockingClient.brpop(confirmKey, Math.ceil(CHAT_CONFIRM_TIMEOUT_MS / 1000));
                } finally {
                    blockingClient.disconnect();
                }
                const confirmed = brpopResult !== null && brpopResult[1] === 'confirmed';

                if (!confirmed) {
                    toolCallsMeta.push({ toolName: response.name, success: false, latencyMs: Date.now() - toolStart });
                    await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, ACTION_CANCELLED_MESSAGE, toolCallsMeta);
                    await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: ACTION_CANCELLED_MESSAGE });
                    return;
                }
            }

            await this.redisPubSub.publish(CHAT_CHANNELS.event(userId), { type: 'tool_used', toolName: response.name, label: tool?.description ?? response.name });

            const isWriteTool = tool?.isWrite ?? false;
            try {
                if (!tool) throw new Error(`Unknown tool: ${response.name}`);
                const rawResult = await Promise.race([
                    tool.execute(tool.schema.parse(response.params), userId),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tool timed out')), tool.timeoutMs)),
                ]);
                toolResult = JSON.stringify(rawResult).substring(0, 2000);
                toolSuccess = true;
                this.logger.info(`chat.tool.called toolName=${response.name} success=true latencyMs=${Date.now() - toolStart} userId=${userId}`);
            } catch (err) {
                toolResult = err instanceof Error ? err.message : 'Tool execution failed';
                this.logger.warn(`chat.tool.error toolName=${response.name} error=${toolResult} userId=${userId}`);
            }

            toolCallsMeta.push({ toolName: response.name, success: toolSuccess, latencyMs: Date.now() - toolStart });
            history.push({ role: 'tool', content: toolResult, toolCallId: response.toolCallId, toolName: response.name });

            // After a confirmed write tool succeeds, do one final AI turn for a summary then stop.
            // Without this, the AI can call the same write tool again in the next iteration, producing duplicates.
            if (isWriteTool && toolSuccess) {
                await this.finalizeWithSummary({
                    provider,
                    systemPrompt,
                    history,
                    userId,
                    startTime,
                    signal,
                    toolCallsMeta,
                    reason: `write-tool-exit iter=${iteration + 1}`,
                    fallbackContent: toolResult,
                });
                return;
            }
        }

        this.logger.warn(`chat.job.exhausted userId=${userId} maxIterations=${maxIterations}`);
        captureSentryException(new Error('Agentic loop max iterations exhausted'), { tags: { userId } });
        await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, FALLBACK_MESSAGE, toolCallsMeta);
        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: FALLBACK_MESSAGE });
    }

    private async finalizeWithSummary(ctx: {
        provider: IAiProvider;
        systemPrompt: string;
        history: ChatHistoryMessage[];
        userId: string;
        startTime: number;
        signal?: AbortSignal;
        toolCallsMeta: Array<{ toolName: string; success: boolean; latencyMs: number }>;
        reason: string;
        fallbackContent?: string;
    }): Promise<void> {
        const { provider, systemPrompt, history, userId, startTime, signal, toolCallsMeta, reason, fallbackContent } = ctx;
        const summaryResponse = await provider.chat({ systemPrompt, history, tools: [], signal });
        const summaryContent = summaryResponse.type === 'text' && summaryResponse.content?.trim() ? summaryResponse.content.trim() : (fallbackContent ?? FALLBACK_MESSAGE);
        const latencyMs = Date.now() - startTime;
        await this.chatMessageRepository.create(
            userId,
            ChatRole.ASSISTANT,
            summaryContent,
            toolCallsMeta,
            summaryResponse.type === 'text' ? summaryResponse.tokenCount : undefined,
            latencyMs,
        );
        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: summaryContent });
        this.logger.info(`chat.job.done userId=${userId} latencyMs=${latencyMs} tools=${toolCallsMeta.length} (${reason})`);
    }
}
